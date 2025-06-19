import { FloatingWindow } from './floatingWindow.js';

class CamLocalDrag {
    constructor() {
        this.localVideoWrapper = document.getElementById('localVideoWrapper');
        this.localVideo = document.getElementById('localVideo');
        this.resizeHandle = document.getElementById('resizeHandle');

        this.localVideoWrapper.style.display = 'none';

        const savedPosition = JSON.parse(localStorage.getItem('localVideoPosition')) || { right: 20, top: 20 };
        const savedSize = JSON.parse(localStorage.getItem('localVideoSize')) || { width: 300, height: 200 };

        this.floatingWindow = new FloatingWindow({
            container: document.getElementById('additionalStreamsContainer'),
            stream: null,
            title: 'My Camera',
            isClosable: false,
            initialWidth: savedSize.width,
            initialHeight: savedSize.height,
            initialRight: savedPosition.right,
            initialTop: savedPosition.top,
            id: 'local-camera-window'
        });

        this.floatingWindow.wrapper.addEventListener('mouseup', () => this.saveState());
        this.floatingWindow.wrapper.addEventListener('touchend', () => this.saveState());
    }

    saveState() {
        const pos = {
            right: parseInt(this.floatingWindow.wrapper.style.right, 10),
            top: parseInt(this.floatingWindow.wrapper.style.top, 10)
        };
        const size = {
            width: this.floatingWindow.wrapper.offsetWidth,
            height: this.floatingWindow.wrapper.offsetHeight
        };
        localStorage.setItem('localVideoPosition', JSON.stringify(pos));
        localStorage.setItem('localVideoSize', JSON.stringify(size));
    }
}

export { CamLocalDrag };
