function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Create upload progress display
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';
    progressContainer.innerHTML = `
        <div class="progress">
            <div class="progress-bar" style="width: 0%">0%</div>
        </div>
        <div class="upload-status">Uploading video...</div>
    `;
    document.body.appendChild(progressContainer);

    // Create FormData and append file
    const formData = new FormData();
    formData.append('video', file);

    // Upload with progress tracking
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            const progressBar = document.querySelector('.progress-bar');
            progressBar.style.width = percentComplete + '%';
            progressBar.textContent = percentComplete + '%';
        }
    };

    xhr.onload = function() {
        if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            const shareableLink = `${window.location.origin}/watch?id=${response.videoId}`;
            
            // Update progress container with shareable link
            progressContainer.innerHTML = `
                <div class="upload-complete">
                    <p>Upload Complete! Share this link:</p>
                    <div class="share-link">
                        <input type="text" value="${shareableLink}" readonly>
                        <button onclick="copyToClipboard('${shareableLink}')">Copy</button>
                    </div>
                </div>
            `;
        } else {
            progressContainer.innerHTML = `
                <div class="upload-error">
                    Upload failed. Please try again.
                </div>
            `;
        }
    };

    xhr.onerror = function() {
        progressContainer.innerHTML = `
            <div class="upload-error">
                Upload failed. Please try again.
            </div>
        `;
    };

    xhr.open('POST', '/upload', true);
    xhr.send(formData);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
        .then(() => alert('Link copied to clipboard!'))
        .catch(err => console.error('Failed to copy:', err));
} 