import React, { useState, useRef, useEffect } from 'react';
import { getDatabase, ref, query, orderByChild, onValue, push, serverTimestamp, equalTo, set, get, remove } from "firebase/database";
import { initializeApp } from "firebase/app";
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import './chatroom.css'

const firebaseConfig = {
    apiKey: "AIzaSyBaUVMp53AyYCAbaFuO2jNEAn7ba5V0Rco",
    authDomain: "newproject-a9f9b.firebaseapp.com",
    projectId: "newproject-a9f9b",
    storageBucket: "newproject-a9f9b.appspot.com",
    messagingSenderId: "713852852186",
    appId: "1:713852852186:web:06c6d4a3da6bb3dd9312e3",
    measurementId: "G-21KFG873H8",
    databaseURL: "https://newproject-a9f9b-default-rtdb.asia-southeast1.firebasedatabase.app/",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const ChatPage = () => {
    const [message, setMessage] = useState('');
    const [chatHistory, setChatHistory] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [users, setUsers] = useState([]);
    const [onlineUsers, setOnlineUsers] = useState({});
    const location = useLocation();
    const { state } = location; 
    const { yourName, roomId, roomName } = state || {};
    const chatListRef = useRef(null);
    const fileInputRef = useRef(null);

    const handleMessageChange = (event) => {
        setMessage(event.target.value);
    };

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            if (file.type.startsWith('image/') || file.type === 'application/pdf') {
                setSelectedFile(file);
                const reader = new FileReader();
                reader.onloadend = () => {
                    setImagePreview(file.type.startsWith('image/') ? reader.result : null);
                };
                reader.readAsDataURL(file);
            } else {
                alert('Please select an image or PDF file');
                setSelectedFile(null);
                setImagePreview(null);
            }
        }
    };

    const clearFileSelection = () => {
        setSelectedFile(null);
        setImagePreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const uploadFile = async (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (file.type.startsWith('image/')) {
                    // For images, continue using imgbb
                    const formData = new FormData();
                    formData.append('image', file);
                    fetch('https://api.imgbb.com/1/upload?key=224409e86bd47c8be56dd9267a86f91f', {
                        method: 'POST',
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            resolve({ url: data.data.url, type: 'image' });
                        } else {
                            reject(new Error('Failed to upload image'));
                        }
                    })
                    .catch(reject);
                } else if (file.type === 'application/pdf') {
                    // For PDFs, use base64 data
                    resolve({
                        url: reader.result,
                        type: 'pdf',
                        name: file.name
                    });
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    };

    const handleSend = async () => {
        if (!message && !selectedFile) return;

        try {
            setUploading(true);
            let fileData = null;

            if (selectedFile) {
                fileData = await uploadFile(selectedFile);
            }

            const messageContent = message.trim() || '';

            const newChat = {
                username: yourName,
                message: messageContent,
                roomId: roomId,
                roomName: roomName,
                timestamp: serverTimestamp(),
                type: fileData ? fileData.type : 'text',
                ...(fileData?.url && { fileUrl: fileData.url }),
                ...(fileData?.name && { fileName: fileData.name })
            };

            await push(ref(db, 'messages'), newChat);
            setMessage('');
            clearFileSelection();
        } catch (error) {
            console.error("Error sending message:", error);
            alert('Failed to send message. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    const handleKeyPress = (event) => {
        if (event.key === 'Enter' && !event.shiftKey && (message.trim() || selectedFile)) {
            event.preventDefault();
            handleSend();
        }
    };

    const getChatHistory = async () => {
        let filteredMessages = query(ref(db, 'messages'), orderByChild('roomId'), equalTo(roomId));
        onValue(filteredMessages, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                let messageMap = Object.entries(data);
                let messageList = Array.from(messageMap.values());
                setChatHistory(messageList);
                scrollToBottom();
            } else {
                setChatHistory([]);
            }
        });
    }

    const scrollToBottom = () => {
        if (chatListRef.current) {
            chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
        }
    };

    // Function to format last seen timestamp
    const formatLastSeen = (timestamp) => {
        if (!timestamp) return 'Unknown';
        
        // Convert Firebase timestamp to JavaScript Date
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        
        // Format based on how long ago
        if (diffSec < 60) {
            return 'Just now';
        } else if (diffMin < 60) {
            return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
        } else if (diffHour < 24) {
            return `${diffHour} ${diffHour === 1 ? 'hour' : 'hours'} ago`;
        } else if (diffDay < 7) {
            return `${diffDay} ${diffDay === 1 ? 'day' : 'days'} ago`;
        } else {
            // Format as date for older timestamps
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        }
    };

    // Function to update user presence
    const updateUserPresence = async () => {
        if (!yourName || !roomId) return;
        
        // Create a user reference
        const userStatusRef = ref(db, `rooms/${roomId}/users/${yourName}`);
        
        // Set the user as online
        await set(userStatusRef, {
            online: true,
            lastSeen: serverTimestamp(),
            joinedAt: serverTimestamp()
        });
        
        // Remove the user when they disconnect
        const userStatusOfflineRef = ref(db, `rooms/${roomId}/users/${yourName}`);
        
        // When user disconnects, update their status
        window.addEventListener('beforeunload', async () => {
            await set(userStatusOfflineRef, {
                online: false,
                lastSeen: serverTimestamp()
            });
        });
    };
    
    // Function to get all users in the room
    const getUsers = () => {
        const usersRef = ref(db, `rooms/${roomId}/users`);
        onValue(usersRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // Convert to array of objects with name and online status
                const usersList = Object.entries(data).map(([name, status]) => ({
                    name,
                    online: status.online,
                    lastSeen: status.lastSeen,
                    joinedAt: status.joinedAt
                }));
                
                // Sort users: online first, then by name
                usersList.sort((a, b) => {
                    if (a.online && !b.online) return -1;
                    if (!a.online && b.online) return 1;
                    return a.name.localeCompare(b.name);
                });
                
                setUsers(usersList);
                
                // Create a map of online users for quick lookup
                const onlineMap = {};
                usersList.forEach(user => {
                    onlineMap[user.name] = user.online;
                });
                setOnlineUsers(onlineMap);
            } else {
                setUsers([]);
                setOnlineUsers({});
            }
        });
    };

    useEffect(() => {
        getChatHistory();
        updateUserPresence();
        getUsers();
        
        // Cleanup function
        return () => {
            // Set user as offline when component unmounts
            const userStatusRef = ref(db, `rooms/${roomId}/users/${yourName}`);
            set(userStatusRef, {
                online: false,
                lastSeen: serverTimestamp()
            });
        };
    }, []);

    const renderMessageContent = (chat) => {
        if (chat[1].type === 'image' && chat[1].fileUrl) {
            return (
                <>
                    <img src={chat[1].fileUrl} alt="Uploaded content" className="message-image" />
                    {chat[1].message && chat[1].message.trim() !== '' && (
                        <p className="message-content">{chat[1].message}</p>
                    )}
                </>
            );
        } else if (chat[1].type === 'pdf' && chat[1].fileUrl) {
            return (
                <div className="pdf-message">
                    <div className="pdf-icon">📄</div>
                    <a 
                        href={chat[1].fileUrl} 
                        download={chat[1].fileName || 'document.pdf'}
                        className="pdf-link"
                    >
                        {chat[1].fileName || 'Download PDF'}
                    </a>
                    {chat[1].message && chat[1].message.trim() !== '' && (
                        <p className="message-content">{chat[1].message}</p>
                    )}
                </div>
            );
        }
        return <p className="message-content">{chat[1].message}</p>;
    };

    return (
        <div className='chat-container'>
            <div className='chat-layout'>
                <div className='chatroom'>
                    <div className="room-header">
                        <h2>{roomName}</h2>
                    </div>
                    <ul ref={chatListRef} className="message-list">
                        {chatHistory.length === 0 ? (
                            <li className="no-messages">No messages yet...</li>
                        ) : (
                            chatHistory.map((chat, index) => {
                                // Skip empty messages
                                if (!chat[1].message && !chat[1].fileUrl) return null;
                                
                                return (
                                    <li key={index} className={chat[1].username === yourName ? 'sent' : 'received'}>
                                        <div className={`message-container ${chat[1].type === 'image' ? 'image-message' : ''}`}>
                                            {chat[1].type === 'image' && chat[1].fileUrl ? (
                                                <>
                                                    <strong className='name'>{chat[1].username}</strong>
                                                    {renderMessageContent(chat)}
                                                </>
                                            ) : (
                                                <>
                                                    <strong className='name'>{chat[1].username}</strong>
                                                    <span className="message-arrow">=&gt;</span>
                                                    {renderMessageContent(chat)}
                                                </>
                                            )}
                                        </div>
                                    </li>
                                );
                            })
                        )}
                    </ul>
                    <div className="input-area">
                        <input 
                            className='input' 
                            type="text" 
                            value={message} 
                            onChange={handleMessageChange}
                            onKeyPress={handleKeyPress}
                            placeholder="Type a message..."
                        />
                        <div className="button-group">
                            <button 
                                className="attach-button"
                                onClick={() => fileInputRef.current?.click()}
                                title="Attach File"
                            >
                                📎
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                accept="image/*,.pdf"
                                className="file-input"
                            />
                            <button 
                                className="send-button"
                                onClick={handleSend}
                                disabled={uploading || (!message && !selectedFile)}
                                title={uploading ? "Sending..." : "Send"}
                            >
                                ➤
                            </button>
                        </div>
                        {selectedFile && (
                            <div className="selected-file">
                                <span>{selectedFile.name}</span>
                                <button onClick={clearFileSelection}>×</button>
                            </div>
                        )}
                        {imagePreview && (
                            <div className="image-preview">
                                <img src={imagePreview} alt="Preview" />
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="users-panel">
                    <div className="users-header">
                        <h3>Room Users</h3>
                        <div className="online-count">
                            {users.filter(user => user.online).length} online
                        </div>
                    </div>
                    <ul className="users-list">
                        {users.length === 0 ? (
                            <li className="no-users">No users yet...</li>
                        ) : (
                            users.map((user, index) => (
                                <li key={index} className={`user-item ${user.name === yourName ? 'current-user' : ''}`}>
                                    <div className={`status-indicator ${user.online ? 'online' : 'offline'}`}></div>
                                    <div className="user-info">
                                        <span className="user-name">{user.name}</span>
                                        {!user.online && user.lastSeen && (
                                            <span className="last-seen">
                                                Last seen: {formatLastSeen(user.lastSeen)}
                                            </span>
                                        )}
                                    </div>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default ChatPage;
