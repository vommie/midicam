import { isElementVisible } from './helpers.js';

export class Chat {
    constructor(options) {
        this.container = options.container;
        this.onSendMessage = options.onSendMessage;
        this.logger = options.logger || { info: console.log, debug: console.log, error: console.error };
        this.notifier = options.notifier;
        this.db = options.db;

        this.messagesEl = this.container.querySelector('.chat-messages');
        this.formEl = this.container.querySelector('.chat-form');
        this.inputEl = this.container.querySelector('.chat-input');
        this.sendButton = this.container.querySelector('.chat-send-button');

        this.peerUUID = null;

        this.sentSound = new Audio('assets/file_sent.wav');
        this.receiveSound = new Audio('assets/notification.wav');

        this._setupHeaderUI();
        this.init();
    }

     init() {
        this.formEl.addEventListener('submit', (e) => this.handleFormSubmit(e));
        this.disable();
    }

    _setupHeaderUI() {
        const header = this.container.querySelector('.sidebar-section-header');
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'header-actions';
        actionsDiv.style.display = 'flex';
        actionsDiv.style.alignItems = 'center';
        actionsDiv.style.gap = '8px';
        actionsDiv.style.marginLeft = 'auto';
        actionsDiv.style.marginRight = '8px';

        this.countLabel = document.createElement('span');
        this.countLabel.style.fontSize = '0.75rem';
        this.countLabel.style.color = '#aaa';
        this.countLabel.textContent = '0 msgs';

        const clearBtn = document.createElement('button');
        clearBtn.innerHTML = '🧹';
        clearBtn.title = 'Clear chat history';
        clearBtn.style.background = 'none';
        clearBtn.style.border = 'none';
        clearBtn.style.cursor = 'pointer';
        clearBtn.style.padding = '0';
        clearBtn.style.fontSize = '1.1rem';

        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearHistory();
        });

        actionsDiv.appendChild(this.countLabel);
        actionsDiv.appendChild(clearBtn);
        header.insertBefore(actionsDiv, header.querySelector('.chevron'));
    }

    async loadHistory(peerUUID) {
        this.peerUUID = peerUUID;
        this.logger.info(`Loading chat history for peer: ${peerUUID}`);

        if (this.db) {
            const history = await this.db.getChats(peerUUID);
            this.messagesEl.innerHTML = '';
            history.forEach(chat => {
                this.addMessage(chat.text, chat.sender, true);
            });
            this._updateCountUI(history.length);

            setTimeout(() => {
                this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
            }, 50);
        } else {
            this.messagesEl.innerHTML = '';
        }
    }

    async clearHistory() {
        if (!this.peerUUID || !this.db) return;
        if (confirm('Are you sure you want to delete the chat history for this peer?')) {
            await this.db.clearChats(this.peerUUID);
            this.messagesEl.innerHTML = '';
            this._updateCountUI(0);
            this.logger.info('Chat history cleared.');
        }
    }

    _updateCountUI(count) {
        this.countLabel.textContent = `${count} msgs`;
    }

    async handleFormSubmit(event) {
        event.preventDefault();
        const message = this.inputEl.value.trim();

        if (message) {
            this.onSendMessage(message);
            this.addMessage(message, 'local');
            this.logger.debug(`Sending local chat message.`);

            if (this.db && this.peerUUID) {
                await this.db.addChat(this.peerUUID, message, 'local');
                const history = await this.db.getChats(this.peerUUID);
                this._updateCountUI(history.length);
            }

            this.inputEl.value = '';
            this.sentSound.play().catch(e => this.logger.error("Error playing chat sent sound:", e));
        }
    }

    async handleRemoteMessage(message) {
        this.addMessage(message, 'remote');
        this.logger.debug(`Received remote chat message.`);

        if (this.db && this.peerUUID) {
            await this.db.addChat(this.peerUUID, message, 'remote');
            const history = await this.db.getChats(this.peerUUID);
            this._updateCountUI(history.length);
        }

        if (!isElementVisible(this.messagesEl) && this.notifier) {
            this.notifier.show({
                position: 'nw',
                icon: 'chat',
                title: 'Incoming chat message!',
                text: message,
                duration: 5000,
                showProgress: true,
                sound: false
            });
        } else {
             this.receiveSound.play().catch(e => this.logger.error("Error playing chat receive sound:", e));
        }
    }

    addMessage(text, sender, isHistory = false) {
        const isScrolledToBottom = this.messagesEl.scrollHeight - this.messagesEl.scrollTop <= this.messagesEl.clientHeight + 20;

        const bubble = document.createElement('div');
        bubble.classList.add('chat-bubble', sender);
        if (isHistory) bubble.style.animation = 'none';

        const senderName = document.createElement('span');
        senderName.classList.add('sender-name');
        senderName.textContent = sender === 'local' ? 'Me' : 'Peer';

        const messageText = document.createElement('p');
        messageText.classList.add('message-text');

        const tempDiv = document.createElement('div');
        tempDiv.textContent = text;
        messageText.innerHTML = tempDiv.innerHTML.replace(/\n/g, '<br>');

        bubble.appendChild(senderName);
        bubble.appendChild(messageText);
        this.messagesEl.appendChild(bubble);

        if (isScrolledToBottom || isHistory) {
            this.messagesEl.scrollTo({
                top: this.messagesEl.scrollHeight,
                behavior: isHistory ? 'auto' : 'smooth'
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
