// ============================================
// Backend: Post Video to Facebook
// ============================================

// Environment variables (set in Vercel)
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const FACEBOOK_PAGE_TOKEN = process.env.FACEBOOK_PAGE_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Supabase client (using fetch directly - no library needed)
const SUPABASE_HEADERS = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
};

// ============================================
// Helper Functions
// ============================================

// Fetch first pending video from Supabase
async function getPendingVideo() {
    const url = `${SUPABASE_URL}/rest/v1/videos?status=eq.pending&order=created_at.asc&limit=1`;
    
    const response = await fetch(url, {
        headers: SUPABASE_HEADERS
    });
    
    const data = await response.json();
    return data[0] || null;
}

// Update video status in Supabase
async function updateVideoStatus(id, status, postId = null) {
    const url = `${SUPABASE_URL}/rest/v1/videos?id=eq.${id}`;
    
    const updateData = {
        status: status,
        ...(postId && { facebook_post_id: postId })
    };
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: SUPABASE_HEADERS,
        body: JSON.stringify(updateData)
    });
    
    return response.ok;
}

// Download video from Google Drive (public link)
async function downloadVideo(driveLink) {
    // Convert Google Drive link to direct download
    let downloadUrl = driveLink;
    
    // Handle different Google Drive link formats
    if (driveLink.includes('drive.google.com')) {
        // Extract file ID
        let fileId = null;
        
        if (driveLink.includes('/d/')) {
            fileId = driveLink.split('/d/')[1].split('/')[0];
        } else if (driveLink.includes('id=')) {
            fileId = driveLink.split('id=')[1].split('&')[0];
        }
        
        if (fileId) {
            downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        }
    }
    
    // Download the video
    const response = await fetch(downloadUrl);
    const buffer = await response.arrayBuffer();
    return buffer;
}

// Post video to Facebook
async function postToFacebook(videoBuffer, caption) {
    // Facebook Graph API endpoint
    const url = `https://graph.facebook.com/v18.0/${FACEBOOK_PAGE_ID}/videos`;
    
    // Create form data
    const formData = new FormData();
    formData.append('access_token', FACEBOOK_PAGE_TOKEN);
    formData.append('description', caption);
    
    // Convert buffer to blob
    const blob = new Blob([videoBuffer], { type: 'video/mp4' });
    formData.append('source', blob, 'video.mp4');
    
    const response = await fetch(url, {
        method: 'POST',
        body: formData
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.error?.message || 'Facebook API error');
    }
    
    return data.id; // Post ID
}

// Get video counts
async function getVideoCounts() {
    const url = `${SUPABASE_URL}/rest/v1/videos?select=status`;
    
    const response = await fetch(url, {
        headers: SUPABASE_HEADERS
    });
    
    const data = await response.json();
    
    let pending = 0, posted = 0, failed = 0;
    
    data.forEach(video => {
        if (video.status === 'pending') pending++;
        else if (video.status === 'posted') posted++;
        else if (video.status === 'failed') failed++;
    });
    
    return { pending, posted, failed };
}

// ============================================
// Main Handler
// ============================================
module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only accept POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { caption } = req.body;
        
        if (!caption) {
            return res.status(400).json({ error: 'Caption is required' });
        }
        
        // Step 1: Get pending video
        const video = await getPendingVideo();
        
        if (!video) {
            return res.status(404).json({ error: 'No pending videos found' });
        }
        
        // Step 2: Download video from Google Drive
        const videoBuffer = await downloadVideo(video.link);
        
        // Step 3: Post to Facebook
        const postId = await postToFacebook(videoBuffer, caption);
        
        // Step 4: Update status in Supabase
        await updateVideoStatus(video.id, 'posted', postId);
        
        // Get updated counts
        const counts = await getVideoCounts();
        
        // Return success
        return res.status(200).json({
            success: true,
            postId: postId,
            videoUrl: video.link,
            pending: counts.pending,
            posted: counts.posted,
            failed: counts.failed
        });
        
    } catch (error) {
        console.error('Error posting video:', error);
        
        // If we had a video, mark it as failed
        try {
            const video = await getPendingVideo();
            if (video) {
                await updateVideoStatus(video.id, 'failed');
            }
        } catch (e) {
            // Ignore
        }
        
        return res.status(500).json({ error: error.message });
    }
};
