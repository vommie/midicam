const CHUNK_SIZE = 65536;

export class FileSharing {
    constructor(options) {
        this.container = document.querySelector(options.container);
        if (!this.container) {
            throw new Error(`FileSharing container '${options.container}' not found.`);
        }
        this.onSendData = options.onSendData;

        this.activeTransfers = new Map();
        this.isEnabled = false;
        this.currentReceiveId = null;
        this.channel = null;

        this.sentSound = new Audio('assets/file_sent.wav');
        this.receiveSound = new Audio('assets/file_receive.wav');

        this._setupUI();
        this._setupEventListeners();
        this.disable();
    }

    _setupUI() {
        this.container.innerHTML = `
            <div class="title">Filesharing</div>
            <div class="filesharing-dropzone">
                <div class="dropzone-content">
                    <svg class="dropzone-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"></path></svg>
                    <p class="dropzone-text-main">Drop files here</p>
                    <p class="dropzone-text-sub">or double click to upload</p>
                </div>
            </div>
            <div class="filesharing-list" role="log"></div>
            <input type="file" class="filesharing-input" multiple style="display: none;">
        `;

        this.dropZoneEl = this.container.querySelector('.filesharing-dropzone');
        this.fileListEl = this.container.querySelector('.filesharing-list');
        this.fileInputEl = this.container.querySelector('.filesharing-input');
    }

    _setupEventListeners() {
        this.dropZoneEl.addEventListener('dragover', this._handleDragOver.bind(this));
        this.dropZoneEl.addEventListener('dragleave', this._handleDragLeave.bind(this));
        this.dropZoneEl.addEventListener('drop', this._handleDrop.bind(this));
        this.dropZoneEl.addEventListener('dblclick', () => {
             if (this.isEnabled) this.fileInputEl.click();
        });
        this.fileInputEl.addEventListener('change', this._handleFileSelect.bind(this));
    }

    enable() {
        this.isEnabled = true;
        this.container.classList.remove('disabled');
        this.dropZoneEl.querySelector('.dropzone-text-main').textContent = 'Drop files here';
        this.dropZoneEl.querySelector('.dropzone-text-sub').style.display = 'block';
    }

    disable() {
        this.isEnabled = false;
        this.container.classList.add('disabled');
        this.dropZoneEl.querySelector('.dropzone-text-main').textContent = 'Connection required';
        this.dropZoneEl.querySelector('.dropzone-text-sub').style.display = 'none';

        this.activeTransfers.forEach(transfer => {
            if (!transfer.completed) {
                this._failTransfer(transfer.id, "Connection lost");
            }
        });
    }

    setChannel(channel) {
        this.channel = channel;
    }

    _handleDragOver(event) {
        event.preventDefault();
        if (this.isEnabled) {
            this.dropZoneEl.classList.add('dragover');
        }
    }

    _handleDragLeave(event) {
        event.preventDefault();
        this.dropZoneEl.classList.remove('dragover');
    }

    _handleDrop(event) {
        event.preventDefault();
        this.dropZoneEl.classList.remove('dragover');
        if (!this.isEnabled) return;
        this._processFiles(event.dataTransfer.files);
    }

    _handleFileSelect(event) {
        if (!this.isEnabled) return;
        this._processFiles(event.target.files);
        this.fileInputEl.value = '';
    }

    _processFiles(files) {
        if (files.length === 0) return;
        console.log(`Processing ${files.length} file(s) for transfer.`);
        for (const file of files) {
            this._sendFile(file);
        }
    }

    async _sendFile(file) {
        const transferId = this._generateId();
        const fileItemEl = this._createFileItemUI(transferId, file.name, file.size, true);
        const startTime = Date.now();

        const transfer = {
            id: transferId,
            file: file,
            element: fileItemEl,
            startTime: startTime,
            completed: false
        };
        this.activeTransfers.set(transferId, transfer);

        const infoPacket = {
            type: 'info',
            id: transferId,
            name: file.name,
            mime: file.type,
            size: file.size
        };
        this.onSendData(JSON.stringify(infoPacket));

        const arrayBuffer = await file.arrayBuffer();
        let offset = 0;

        while (offset < file.size) {
            await this._waitForBuffer();
            const chunk = arrayBuffer.slice(offset, offset + CHUNK_SIZE);
            this.onSendData(chunk);
            offset += chunk.byteLength;
            const progress = (offset / file.size) * 100;
            const speed = offset / ((Date.now() - startTime) / 1000);
            this._updateProgressUI(transferId, progress, speed);
        }

        this._finalizeTransfer(transferId, new Blob([arrayBuffer], { type: file.type }));
        this.sentSound.play().catch(e => console.error("Error playing sound:", e));
    }

    handleRemoteData(data) {
        if (typeof data === 'string') {
            try {
                const packet = JSON.parse(data);
                if (packet.type === 'info') {
                    this._handleInfoPacket(packet);
                }
            } catch (e) {
                console.error("Failed to parse file info packet:", e);
            }
        } else if (data instanceof ArrayBuffer) {
            this._handleChunkPacket(data);
        }
    }

    _handleInfoPacket(packet) {
        const fileItemEl = this._createFileItemUI(packet.id, packet.name, packet.size, false);
        const transfer = {
            id: packet.id,
            name: packet.name,
            type: packet.mime,
            size: packet.size,
            receivedSize: 0,
            chunks: [],
            element: fileItemEl,
            startTime: Date.now(),
            completed: false
        };
        this.activeTransfers.set(packet.id, transfer);
        this.currentReceiveId = packet.id;
    }

    _handleChunkPacket(data) {
        if (!this.currentReceiveId) {
            console.warn("Received a chunk packet without an active file transfer. Ignoring.");
            return;
        }

        const transfer = this.activeTransfers.get(this.currentReceiveId);
        if (!transfer || transfer.completed) return;

        const chunk = data;
        transfer.chunks.push(chunk);
        transfer.receivedSize += chunk.byteLength;

        const progress = (transfer.receivedSize / transfer.size) * 100;
        const speed = transfer.receivedSize / ((Date.now() - transfer.startTime) / 1000);
        this._updateProgressUI(transfer.id, progress, speed);

        if (transfer.receivedSize >= transfer.size) {
            const fileBlob = new Blob(transfer.chunks, { type: transfer.type });
            this._finalizeTransfer(transfer.id, fileBlob);
            this.receiveSound.play().catch(e => console.error("Error playing sound:", e));
            this.currentReceiveId = null;
        }
    }

    _createFileItemUI(id, name, size, isSent) {
        const item = document.createElement('div');
        item.className = `file-item ${isSent ? 'sent' : 'received'}`;
        item.dataset.id = id;

        const directionIcon = isSent ? '⬆' : '⬇';
        const mimeIcon = this._getMimeIcon(name);

        item.innerHTML = `
            <span class="direction">${directionIcon}</span>
            <img src="assets/${mimeIcon}" class="icon" alt="file type icon">
            <div class="file-info">
                <span class="file-name"></span>
                <span class="file-size">${this._formatBytes(size)}</span>
            </div>
            <div class="file-status">
                <div class="progress-container">
                    <div class="progress-bar"></div>
                </div>
                <span class="status-text"></span>
                <a href="#" class="file-action" style="display:none;" title="Datei öffnen/herunterladen">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"></path></svg>
                </a>
            </div>
        `;
        item.querySelector('.file-name').textContent = name;
        this.fileListEl.prepend(item);
        return item;
    }

    _updateProgressUI(id, progress, speed) {
        const transfer = this.activeTransfers.get(id);
        if (!transfer) return;

        const progressBar = transfer.element.querySelector('.progress-bar');
        const statusText = transfer.element.querySelector('.status-text');

        progressBar.style.width = `${progress}%`;
        statusText.textContent = `${Math.round(progress)}% (${this._formatBytes(speed)}/s)`;
    }

    _failTransfer(id, reason) {
        const transfer = this.activeTransfers.get(id);
        if (!transfer) return;

        transfer.completed = true;
        transfer.element.classList.add('failed');
        const statusText = transfer.element.querySelector('.status-text');
        statusText.textContent = `Fehlgeschlagen: ${reason}`;
        transfer.element.querySelector('.progress-container').style.display = 'none';
    }

    _finalizeTransfer(id, fileBlob) {
        const transfer = this.activeTransfers.get(id);
        if (!transfer) return;

        transfer.completed = true;
        transfer.element.querySelector('.progress-container').style.display = 'none';
        transfer.element.querySelector('.status-text').style.display = 'none';

        const actionLink = transfer.element.querySelector('.file-action');
        actionLink.style.display = 'block';

        const fileName = transfer.file ? transfer.file.name : transfer.name;
        const fileType = transfer.file ? transfer.file.type : transfer.type;

        actionLink.onclick = (e) => {
            e.preventDefault();
            const url = URL.createObjectURL(fileBlob);
            if (fileType.startsWith('image/') || fileType.startsWith('text/') || fileType === 'application/pdf' || fileType.startsWith('video/') || fileType.startsWith('audio/')) {
                 window.open(url, '_blank');
            } else {
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        };
    }

    _getMimeIcon(fileNameOrType) {
        const type = fileNameOrType.includes('/') ? fileNameOrType : this._getMimeTypeFromName(fileNameOrType);
        if (type.startsWith('image/')) return 'file_image.svg';
        if (type === 'application/pdf') return 'file_pdf.svg';
        if (type.startsWith('text/')) return 'file_text.svg';
        if (type.startsWith('audio/')) return 'file_audio.svg';
        if (type.startsWith('video/')) return 'file_video.svg';
        if (type.includes('zip') || type.includes('rar') || type.includes('archive')) return 'file_archive.svg';
        return 'file_generic.svg';
    }

    _getMimeTypeFromName(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        const mimeMap = {
            'txt': 'text/plain', 'html': 'text/html', 'css': 'text/css', 'js': 'text/javascript',
            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'svg': 'image/svg+xml',
            'mp3': 'audio/mpeg', 'wav': 'audio/wav',
            'mp4': 'video/mp4', 'webm': 'video/webm',
            'pdf': 'application/pdf',
            'zip': 'application/zip'
        };
        return mimeMap[ext] || 'application/octet-stream';
    }

    _formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    _generateId() {
        return Math.random().toString(36).substr(2, 9);
    }

    _waitForBuffer() {
        return new Promise(resolve => {
            const check = () => {
                if (this.channel && this.channel.bufferedAmount > this.channel.bufferedAmountLowThreshold) {
                    setTimeout(check, 100);
                } else {
                    resolve();
                }
            };
            check();
        });
    }
}
