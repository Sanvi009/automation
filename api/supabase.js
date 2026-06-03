export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { 
    SUPABASE_URL, 
    SUPABASE_ANON_KEY, 
    TABLE_NAME,
    FACEBOOK_PAGE_ID,
    FACEBOOK_PAGE_TOKEN
  } = process.env;

  // GET - Fetch data
  if (req.method === 'GET') {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    const data = await response.json();
    return res.status(200).json(data);
  }

  // POST - Edit row
  if (req.method === 'POST' && req.body.action === 'edit') {
    const { id, data } = req.body;
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(data)
    });
    return res.status(200).json({ success: true });
  }

  // DELETE - Delete row
  if (req.method === 'DELETE') {
    const { id } = req.body;
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    return res.status(200).json({ success: true });
  }

  // POST - Post to Facebook (download + upload)
  if (req.method === 'POST' && req.body.action === 'post_to_facebook') {
    const { id, link, caption } = req.body;

    if (!FACEBOOK_PAGE_ID || !FACEBOOK_PAGE_TOKEN) {
      return res.status(500).json({ error: 'Missing Facebook credentials' });
    }

    try {
      // 1. Extract file ID from Google Drive link
      const fileId = link.match(/\/d\/(.+?)\//)?.[1] || '';
      if (!fileId) {
        return res.status(400).json({ error: 'Invalid Google Drive link' });
      }

      // 2. Convert to direct download link
      const directLink = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
      console.log('Downloading from:', directLink);

      // 3. Download the video
      const videoResponse = await fetch(directLink);
      if (!videoResponse.ok) {
        throw new Error('Failed to download video from Google Drive');
      }
      const videoBuffer = await videoResponse.arrayBuffer();

      // 4. Create FormData for Facebook upload
      const formData = new FormData();
      const videoFile = new File([videoBuffer], 'video.mp4', { type: 'video/mp4' });
      formData.append('source', videoFile);
      formData.append('description', caption || '');
      formData.append('access_token', FACEBOOK_PAGE_TOKEN);

      // 5. Post to Facebook
      console.log('Uploading to Facebook...');
      const fbResponse = await fetch(`https://graph.facebook.com/v18.0/${FACEBOOK_PAGE_ID}/videos`, {
        method: 'POST',
        body: formData
      });

      const fbResult = await fbResponse.json();

      if (fbResult.error) {
        console.error('Facebook error:', fbResult.error);
        // Update status to failed
        await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=eq.${id}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ status: 'failed' })
        });
        return res.status(400).json({ error: fbResult.error.message });
      }

      // 6. Update status to posted
      await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ status: 'posted' })
      });

      return res.status(200).json({ success: true, fbResult });
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(400).json({ error: 'Invalid request' });
}
