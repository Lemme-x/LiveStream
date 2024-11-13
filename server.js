const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Configure multer for video upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9]/g, '_');
        cb(null, Date.now() + '-' + safeName);
    }
});

const upload = multer({ storage: storage });

// Serve static files
app.use(express.static('public'));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
    console.log('Uploads directory created');
}

// Check if directory is writable
try {
    fs.accessSync(uploadsDir, fs.constants.W_OK);
    console.log('Uploads directory is writable');
} catch (err) {
    console.error('Uploads directory is not writable');
    process.exit(1);
}

console.log('Upload directory setup completed successfully');

// Track viewers for each stream
const streamViewers = new Map();

io.on('connection', (socket) => {
    let currentStreamId = null;

    socket.on('joinAsStreamer', (streamId) => {
        currentStreamId = streamId;
        socket.join(`stream_${streamId}`);
        socket.emit('streamerConnected', streamId);
    });

    socket.on('joinAsViewer', (streamId) => {
        currentStreamId = streamId;
        socket.join(`stream_${streamId}`);
        
        // Update viewer count
        if (!streamViewers.has(streamId)) {
            streamViewers.set(streamId, new Set());
        }
        streamViewers.get(streamId).add(socket.id);
        
        // Notify streamer about new viewer count
        io.to(`stream_${streamId}`).emit('viewerCount', {
            count: streamViewers.get(streamId).size
        });
    });

    socket.on('disconnect', () => {
        if (currentStreamId && streamViewers.has(currentStreamId)) {
            streamViewers.get(currentStreamId).delete(socket.id);
            io.to(`stream_${currentStreamId}`).emit('viewerCount', {
                count: streamViewers.get(currentStreamId).size
            });
        }
    });
});

// Handle video upload
app.post('/upload', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const videoId = req.file.filename;
    const shareableLink = `${req.protocol}://${req.get('host')}/share/${videoId}`;
    
    res.json({
        message: 'Upload successful',
        shareableLink: shareableLink
    });
});

// Handle video streaming
app.get('/stream/:filename', (req, res) => {
    const filename = req.params.filename;
    const videoPath = path.join(__dirname, 'uploads', filename);

    if (!fs.existsSync(videoPath)) {
        return res.status(404).send('Video not found');
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(videoPath, {start, end});
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
        };
        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res);
    }
});

// Modify the share endpoint to create streamer view
app.get('/share/:filename', (req, res) => {
    const filename = req.params.filename;
    const videoPath = path.join(__dirname, 'uploads', filename);

    if (!fs.existsSync(videoPath)) {
        return res.status(404).send('Video not found');
    }

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Stream Control</title>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
            <style>
                body {
                    margin: 0;
                    padding: 20px;
                    font-family: 'Poppins', sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                }
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    background: white;
                    padding: 2rem;
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.1);
                }
                .stream-info {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 2rem;
                }
                .viewer-count {
                    font-size: 1.2rem;
                    color: #4a5568;
                    padding: 1rem;
                    background: #f7fafc;
                    border-radius: 8px;
                }
                .share-section {
                    margin-top: 2rem;
                    padding: 1rem;
                    background: #f7fafc;
                    border-radius: 8px;
                }
                .video-container {
                    width: 100%;
                    max-width: 800px;
                    margin: 0 auto;
                }
                video {
                    width: 100%;
                    border-radius: 8px;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                }
                .viewer-link {
                    padding: 1rem;
                    background: #edf2f7;
                    border-radius: 4px;
                    word-break: break-all;
                }
                .copy-btn {
                    background: #667eea;
                    color: white;
                    border: none;
                    padding: 0.5rem 1rem;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-top: 1rem;
                }
                .copy-btn:hover {
                    background: #764ba2;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="stream-info">
                    <h2>Stream Control Panel</h2>
                    <div class="viewer-count">
                        Viewers: <span id="viewerCount">0</span>
                    </div>
                </div>
                
                <div class="video-container">
                    <video controls>
                        <source src="/stream/${filename}" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                </div>

                <div class="share-section">
                    <h3>Share with Viewers</h3>
                    <div class="viewer-link" id="viewerLink"></div>
                    <button class="copy-btn" onclick="copyViewerLink()">Copy Link</button>
                </div>
            </div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                const streamId = '${filename}';
                
                // Join as streamer
                socket.emit('joinAsStreamer', streamId);
                
                // Generate viewer link
                const viewerLink = \`\${window.location.origin}/view/\${streamId}\`;
                document.getElementById('viewerLink').textContent = viewerLink;
                
                // Update viewer count
                socket.on('viewerCount', (data) => {
                    document.getElementById('viewerCount').textContent = data.count;
                });
                
                function copyViewerLink() {
                    navigator.clipboard.writeText(viewerLink)
                        .then(() => alert('Link copied to clipboard!'))
                        .catch(err => console.error('Failed to copy:', err));
                }
            </script>
        </body>
        </html>
    `;
    
    res.send(html);
});

// Add viewer endpoint
app.get('/view/:filename', (req, res) => {
    const filename = req.params.filename;
    const videoPath = path.join(__dirname, 'uploads', filename);

    if (!fs.existsSync(videoPath)) {
        return res.status(404).send('Video not found');
    }

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Stream Viewer</title>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
            <style>
                body {
                    margin: 0;
                    padding: 20px;
                    font-family: 'Poppins', sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .video-container {
                    max-width: 800px;
                    width: 100%;
                    background: white;
                    padding: 2rem;
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.1);
                }
                video {
                    width: 100%;
                    border-radius: 8px;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                }
            </style>
        </head>
        <body>
            <div class="video-container">
                <video controls>
                    <source src="/stream/${filename}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                const streamId = '${filename}';
                
                // Join as viewer
                socket.emit('joinAsViewer', streamId);
            </script>
        </body>
        </html>
    `;
    
    res.send(html);
});

// Update server start
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 