const socket = io();
let peer;

const urlParams = new URLSearchParams(window.location.search);
const videoId = urlParams.get('id');

if (!videoId) {
    alert('Invalid video link!');
} else {
    initializeViewer();
}

function initializeViewer() {
    peer = new Peer();
    
    peer.on('open', (id) => {
        socket.emit('join-stream', videoId);
    });

    socket.on('peer-found', (peerId) => {
        const conn = peer.connect(peerId);
        
        conn.on('open', () => {
            conn.send({ type: 'request-stream' });
        });
    });

    peer.on('call', (call) => {
        call.answer();
        
        call.on('stream', (remoteStream) => {
            const videoPlayer = document.getElementById('videoPlayer');
            videoPlayer.srcObject = remoteStream;
            videoPlayer.play();
            document.getElementById('status').style.display = 'none';
        });
    });

    socket.on('peer-not-found', () => {
        document.getElementById('status').textContent = 'Video not found or peer is offline';
    });
} 