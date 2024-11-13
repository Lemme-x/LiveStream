const socket = io();
let peer;
let videoId;

document.getElementById('uploadBtn').addEventListener('click', uploadVideo);
document.getElementById('copyBtn').addEventListener('click', copyShareLink);

async function uploadVideo() {
    const fileInput = document.getElementById('videoInput');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a video file first!');
        return;
    }

    const formData = new FormData();
    formData.append('video', file);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (data.success) {
            videoId = data.videoId;
            setupPeerConnection();
            showShareLink();
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert('Upload failed!');
    }
}

function setupPeerConnection() {
    peer = new Peer();
    
    peer.on('open', (id) => {
        socket.emit('register-peer', videoId);
    });

    peer.on('connection', (conn) => {
        conn.on('open', () => {
            const videoElement = document.createElement('video');
            videoElement.src = URL.createObjectURL(fileInput.files[0]);
            
            conn.on('data', (data) => {
                if (data.type === 'request-stream') {
                    // Start streaming video chunks
                    streamVideo(conn, videoElement);
                }
            });
        });
    });
}

function streamVideo(conn, videoElement) {
    const stream = videoElement.captureStream();
    const call = peer.call(conn.peer, stream);
}

function showShareLink() {
    const shareContainer = document.getElementById('shareContainer');
    const shareLinkInput = document.getElementById('shareLink');
    const shareLink = `${window.location.origin}/viewer.html?id=${videoId}`;
    
    shareLinkInput.value = shareLink;
    shareContainer.style.display = 'block';
}

function copyShareLink() {
    const shareLinkInput = document.getElementById('shareLink');
    shareLinkInput.select();
    document.execCommand('copy');
    alert('Link copied to clipboard!');
}

document.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData();
    const fileInput = document.querySelector('input[type="file"]');
    
    if (!fileInput.files || !fileInput.files[0]) {
        alert('Please select a file first');
        return;
    }
    
    formData.append('video', fileInput.files[0]);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Server response:', data);  // Debug log
        
        if (!data.shareableLink) {
            throw new Error('No shareable link in response');
        }

        // Create or get the status div
        let statusDiv = document.getElementById('uploadStatus');
        if (!statusDiv) {
            statusDiv = document.createElement('div');
            statusDiv.id = 'uploadStatus';
            document.querySelector('form').after(statusDiv);
        }
        
        // Display the sharable link
        statusDiv.innerHTML = `
            <p style="color: green;">Upload successful!</p>
            <p>Sharable link: <a href="${data.shareableLink}" target="_blank">${data.shareableLink}</a></p>
        `;
    } catch (error) {
        console.error('Upload error:', error);
        const statusDiv = document.getElementById('uploadStatus') || document.createElement('div');
        statusDiv.innerHTML = `<p style="color: red;">Error uploading file: ${error.message}</p>`;
        document.querySelector('form').after(statusDiv);
    }
}); 