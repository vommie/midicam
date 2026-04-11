/**
 * MINI - Musical Instrument Network Interface
 * Based on the paper: "MINI - Making MIDI fit for Real-time Musical Interaction over the Internet"
 * Implements combinatorial Chord-Encoding and bandwidth reductions.
 */

const N_KEYS = 88;
const MAX_K = 8; // Maximum voice limits per MINI payload slice to fit within typical Size-Code specs

// Memoization table for combinations to speed up combinadics
const memoNCr = {};

function nCr(n, k) {
    if (k < 0 || k > n) return 0n;
    if (k === 0 || k === n) return 1n;
    if (k > n / 2) k = n - k;
    const key = `${n},${k}`;
    if (memoNCr[key]) return memoNCr[key];

    let res = 1n;
    for (let i = 1n; i <= BigInt(k); i++) {
        res = (res * BigInt(n) - res * i + res) / i;
    }
    memoNCr[key] = res;
    return res;
}

function rankCombination(subset) {
    // Subset must be sorted strictly ascending
    let rank = 0n;
    for (let i = 0; i < subset.length; i++) {
        rank += nCr(subset[i], i + 1);
    }
    return rank;
}

function unrankCombination(rank, k) {
    let subset =[];
    let currentRank = BigInt(rank);
    for (let i = k; i >= 1; i--) {
        let c = i - 1;
        while (nCr(c + 1, i) <= currentRank) {
            c++;
        }
        subset.unshift(c);
        currentRank -= nCr(c, i);
    }
    return subset;
}

export class MINICodec {
    /**
     * Encodes an array of standard MIDI events into an array of MINI Uint8Arrays
     */
    static encode(events) {
        const noteOns =[];
        const noteOffs = [];
        const controllers =[];

        events.forEach(ev => {
            const cmd = ev[0] & 0xF0;
            if (cmd === 144 && ev[2] > 0) {
                noteOns.push(ev);
            } else if (cmd === 128 || (cmd === 144 && ev[2] === 0)) {
                noteOffs.push(ev);
            } else if (cmd === 176 || cmd === 224 || cmd === 192) {
                controllers.push(ev);
            }
        });

        const miniWords =[];

        // Note Ons
        miniWords.push(...this._encodeChords(noteOns, false));

        // Note Offs
        miniWords.push(...this._encodeChords(noteOffs, true));

        // Controllers, PitchBend, Program Change
        controllers.forEach(ctrl => {
            const cmd = ctrl[0] & 0xF0;
            const ctrlCode = this._mapController(cmd, ctrl[1]);
            if (ctrlCode !== -1) {
                const buf = new Uint8Array(2);
                // SizeCode = 000 (Controller message)
                buf[0] = (ctrlCode & 0x07) << 2; // [000][ctrl:3] [pad:2]
                // Pitch bend maps 14 bit to 7 bit (MSB). Program Change is in data1, others in data2.
                buf[1] = cmd === 192 ? (ctrl[1] & 0x7F) : (ctrl[2] & 0x7F);
                miniWords.push(buf);
            }
        });

        return miniWords;
    }

    static _encodeChords(notes, isNoteOff) {
        if (notes.length === 0) return [];
        const words =[];

        // Deduplicate keys
        const uniqueMap = new Map();
        notes.forEach(n => {
            const keyIndex = n[1] - 21; // MIDI Note 21 (A0) maps to index 0
            if (keyIndex >= 0 && keyIndex < N_KEYS) {
                uniqueMap.set(keyIndex, n[2]); // key -> velocity
            }
        });

        const keys = Array.from(uniqueMap.keys()).sort((a, b) => a - b);

        // Split into chunks if voices exceed MAX_K
        for (let i = 0; i < keys.length; i += MAX_K) {
            const chunk = keys.slice(i, i + MAX_K);
            const k = chunk.length;
            const rank = rankCombination(chunk);

            let sumVel = 0;
            chunk.forEach(key => sumVel += uniqueMap.get(key));
            const avgVel = Math.round(sumVel / k) & 0x7F;

            const rankBits = this._getRankBits(k);
            const totalBits = 15 + rankBits;
            const totalBytes = Math.ceil(totalBits / 8);

            let word = 0n;
            word = (word << 3n) | BigInt(totalBytes);
            word = (word << 1n) | (isNoteOff ? 1n : 0n);
            word = (word << 4n) | BigInt(k);
            word = (word << BigInt(rankBits)) | rank;
            word = (word << 7n) | BigInt(avgVel);

            const shiftPad = BigInt(totalBytes * 8 - totalBits);
            word = word << shiftPad;

            const buf = new Uint8Array(totalBytes);
            for (let j = 0; j < totalBytes; j++) {
                buf[j] = Number((word >> BigInt(8 * (totalBytes - 1 - j))) & 0xFFn);
            }
            words.push(buf);
        }
        return words;
    }

    static _getRankBits(k) {
        const maxRank = nCr(N_KEYS, k) - 1n;
        let bits = 0;
        let temp = maxRank;
        while (temp > 0n) {
            bits++;
            temp >>= 1n;
        }
        return bits === 0 ? 1 : bits;
    }

    static _mapController(cmd, data1) {
        if (cmd === 192) return 0; // Program Change
        if (cmd === 224) return 1; // Pitch Bend
        // Control changes (cmd === 176)
        const map = {
            1: 2,  // Modulation
            7: 3,  // Volume
            91: 4, // Reverb
            93: 5, // Chorus
            64: 6, // Sustain
            66: 7  // Sostenuto
        };
        return map[data1] !== undefined ? map[data1] : -1;
    }

    /**
     * Decodes an array of MINI Uint8Array words back into standard MIDI events
     */
    static decode(miniWords) {
        const standardMessages =[];

        miniWords.forEach(buf => {
            if (buf.length < 2) return;
            const sizeCode = buf[0] >> 5;

            if (sizeCode === 0) {
                // Controllers
                const ctrlCode = (buf[0] >> 2) & 0x07;
                const value = buf[1] & 0x7F;

                if (ctrlCode === 0) { // Program Change
                    standardMessages.push([192, value]);
                } else if (ctrlCode === 1) { // Pitch Bend (extrapolated back to MSB)
                    standardMessages.push([224, 0, value]);
                } else { // Standard CC
                    const midiCc = this._unmapController(ctrlCode);
                    if (midiCc !== -1) {
                        standardMessages.push([176, midiCc, value]);
                    }
                }
            } else if (sizeCode === 1) {
                // MINI Timestamp Message - Not utilized here as WebRTC framing provides better metrics
            } else {
                // Chord Encoding NoteOn / NoteOff
                const noteOffCode = (buf[0] >> 4) & 0x01;
                const k = buf[0] & 0x0F;
                if (k === 0 || k > MAX_K) return; // Ignore invalid counts

                const rankBits = this._getRankBits(k);
                const totalBits = 15 + rankBits;
                const totalBytes = sizeCode;

                if (buf.length !== totalBytes) return; // Broken frame

                let word = 0n;
                for (let i = 0; i < totalBytes; i++) {
                    word = (word << 8n) | BigInt(buf[i]);
                }
                const shiftPad = BigInt(totalBytes * 8 - totalBits);
                word = word >> shiftPad;

                const velocity = Number(word & 0x7Fn);
                word = word >> 7n;
                const rank = word & ((1n << BigInt(rankBits)) - 1n);

                const keys = unrankCombination(rank, k);
                const cmd = noteOffCode === 1 ? 128 : 144;
                const actualVel = noteOffCode === 1 ? 0 : velocity;

                keys.forEach(keyIndex => {
                    standardMessages.push([cmd, keyIndex + 21, actualVel]);
                });
            }
        });

        return standardMessages;
    }

    static _unmapController(miniCc) {
        const unmap = {
            2: 1,  // Modulation
            3: 7,  // Volume
            4: 91, // Reverb
            5: 93, // Chorus
            6: 64, // Sustain
            7: 66  // Sostenuto
        };
        return unmap[miniCc] !== undefined ? unmap[miniCc] : -1;
    }
}
