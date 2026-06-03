// ============================================
// Environment variables from Vercel ONLY
// ============================================
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const FACEBOOK_PAGE_TOKEN = process.env.FACEBOOK_PAGE_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const SUPABASE_HEADERS = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
};

// ============================================
// Helper Functions
// ============================================

async function getPendingVideo() {
    const url = `${SUPABASE_URL}/rest/v1/videos?status=eq.pending&order=created_at.asc&limit=1`;
    const response = await fetch(url, { headers: SUPABASE_HEADERS });
    const data = await response.json();
    return data[0] || null;
}

async function updateVideoStatus(id, status) {
    const url = `${SUPABASE_URL}/rest/v1/videos?id=eq.${id}`;
    const response = await fetch(url, {
        method: 'PATCH',
        headers: SUPABASE_HEADERS,
        body: JSON.stringify({ status })
    });
    return response.ok;
}

async function downloadVideo(driveLink) {
    let downloadUrl = driveLink;
    
    if (driveLink.includes('drive.google.com')) {
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
    
    const response = await fetch(downloadUrl);
    return await response.arrayBuffer();
}

async function postToFacebook(videoBuffer, caption) {
    const url = `https://graph.facebook.com/v18.0/${FACEBOOK_PAGE_ID}/videos`;
    
    const formData = new FormData();
    formData.append('access_token', FACEBOOK_PAGE_TOKEN);
    formData.append('description', caption);
    
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
    
    return data.id;
}

// ============================================
// Main Handler
// ============================================
module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
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
        
        // Step 2: Download video
        const videoBuffer = await downloadVideo(video.link);
        
        // Step 3: Post to Facebook
        const postId = await postToFacebook(videoBuffer, caption);
        
        // Step 4: Update status
        await updateVideoStatus(video.id, 'posted');
        
        return res.status(200).json({
            success: true,
            postId: postId
        });
        
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message });
    }
};
