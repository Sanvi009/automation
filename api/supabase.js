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

  // POST - Post to Facebook (via Supabase Storage)
  if (req.method === 'POST' && req.body.action === 'post_to_facebook') {
    const { id, link, caption } = req.body;

    if (!FACEBOOK_PAGE_ID || !FACEBOOK_PAGE_TOKEN) {
      return res.status(500).json({ error: 'Missing Facebook credentials' });
    }

    let storagePath = '';

    try {
      // 1. Extract file ID from Google Drive link
      const fileId = link.match(/\/d\/(.+?)\//)?.[1] || '';
      if (!fileId) {
        return res.status(400).json({ error: 'Invalid Google Drive link' });
      }

      // 2. Convert to direct download link
      const directLink = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
      
      // 3. Download video from Google Drive
      const videoResponse = await fetch(directLink);
      if (!videoResponse.ok) {
        throw new Error('Failed to download video from Google Drive');
      }
      const videoBuffer = await videoResponse.arrayBuffer();

      // 4. Generate unique filename
      const fileName = `video_${id}_${Date.now()}.mp4`;
      storagePath = fileName;

      // 5. Upload to Supabase Storage
      const uploadResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/video/${fileName}`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'video/mp4'
        },
        body: videoBuffer
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload video to Supabase Storage');
      }

      // 6. Get public URL of the uploaded video
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/video/${fileName}`;

      // 7. Post to Facebook using the public URL
      const fbResponse = await fetch(`https://graph.facebook.com/v18.0/${FACEBOOK_PAGE_ID}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_url: publicUrl,
          description: caption || '',
          access_token: FACEBOOK_PAGE_TOKEN
        })
      });

      const fbResult = await fbResponse.json();

      if (fbResult.error) {
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
        
        // Delete temp file from storage
        await fetch(`${SUPABASE_URL}/storage/v1/object/video/${fileName}`, {
          method: 'DELETE',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        });
        
        return res.status(400).json({ error: fbResult.error.message });
      }

      // 8. Update status to posted
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

      // 9. Delete temp file from Supabase Storage
      await fetch(`${SUPABASE_URL}/storage/v1/object/video/${fileName}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });

      return res.status(200).json({ success: true, fbResult });
    } catch (error) {
      // Clean up if any error occurred
      if (storagePath) {
        try {
          await fetch(`${SUPABASE_URL}/storage/v1/object/video/${storagePath}`, {
            method: 'DELETE',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
          });
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      }

      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(400).json({ error: 'Invalid request' });
}
