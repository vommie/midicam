export class Chat {

    constructor(options) {
        this.container = options.container;
        this.onSendMessage = options.onSendMessage;
        this.logger = options.logger || { info: console.log, debug: console.log, error: console.error };

        this.messagesEl = this.container.querySelector('.chat-messages');
        this.formEl = this.container.querySelector('.chat-form');
        this.inputEl = this.container.querySelector('.chat-input');
        this.sendButton = this.container.querySelector('.chat-send-button');

        this.sentSound = new Audio('assets/file_sent.wav');
        this.receiveSound = new Audio('assets/notification.wav');

        this.init();
    }

    init() {
        this.formEl.addEventListener('submit', (e) => this.handleFormSubmit(e));
        this.disable();
    }

    handleFormSubmit(event) {
        event.preventDefault();
        const message = this.inputEl.value.trim();

        if (message) {
            this.onSendMessage(message);
            this.addMessage(message, 'local');
            this.logger.debug(`Sending local chat message.`);
            this.inputEl.value = '';
            this.sentSound.play().catch(e => this.logger.error("Error playing chat sent sound:", e));
        }
    }

    handleRemoteMessage(message) {
        this.addMessage(message, 'remote');
        this.logger.debug(`Received remote chat message.`);
        this.receiveSound.play().catch(e => this.logger.error("Error playing chat receive sound:", e));
    }

    addMessage(text, sender) {
        const isScrolledToBottom = this.messagesEl.scrollHeight - this.messagesEl.scrollTop <= this.messagesEl.clientHeight + 20;

        const bubble = document.createElement('div');
        bubble.classList.add('chat-bubble', sender);

        const senderName = document.createElement('span');
        senderName.classList.add('sender-name');
        senderName.textContent = sender === 'local' ? 'Me' : 'Peer';

        const messageText = document.createElement('p');
        messageText.classList.add('message-text');
        messageText.textContent = text;

        bubble.appendChild(senderName);
        bubble.appendChild(messageText);
        this.messagesEl.appendChild(bubble);

        if (isScrolledToBottom) {
            this.messagesEl.scrollTo({
                top: this.messagesEl.scrollHeight,
                behavior: 'smooth'
            });
        }
    }

    enable() {
        this.container.classList.remove('disabled');
        this.inputEl.disabled = false;
        this.sendButton.disabled = false;
        this.inputEl.placeholder = 'Type message...';
        this.logger.info('Chat enabled.');
    }

    disable() {
        this.container.classList.add('disabled');
        this.inputEl.disabled = true;
        this.sendButton.disabled = true;
        this.inputEl.placeholder = 'Chat not connected';
        this.logger.info('Chat disabled.');
    }
}
