import { FloatingWindow } from './floatingWindow.js';

class CamLocalDrag {
    constructor() {
        this.localVideoWrapper = document.getElementById('localVideoWrapper');
        this.localVideo = document.getElementById('localVideo');
        this.resizeHandle = document.getElementById('resizeHandle');

        this.localVideoWrapper.style.display = 'none';

        this.floatingWindow = new FloatingWindow({
            container: document.getElementById('additionalStreamsContainer'),
            stream: null,
            title: 'My Camera',
            isClosable: false,
            initialWidth: 300,
            initialHeight: 200,
            initialRight: 20,
            initialTop: 20,
            id: 'local-camera-window'
        });
    }
}

export { CamLocalDrag };
