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

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TABLE_NAME) {
    return res.status(500).json({ error: 'Missing Supabase environment variables' });
  }

  // GET - Fetch all rows
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
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const error = await response.text();
      return res.status(400).json({ error });
    }
    return res.status(200).json({ success: true });
  }

  // DELETE - Delete row
  if (req.method === 'DELETE') {
    const { id } = req.body;
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (!response.ok) {
      const error = await response.text();
      return res.status(400).json({ error });
    }
    return res.status(200).json({ success: true });
  }

  // POST - Post to Facebook
  if (req.method === 'POST' && req.body.action === 'post_to_facebook') {
    const { id, link, caption } = req.body;

    if (!FACEBOOK_PAGE_ID || !FACEBOOK_PAGE_TOKEN) {
      return res.status(500).json({ error: 'Missing Facebook credentials' });
    }

    try {
      // Post to Facebook
      const fbResponse = await fetch(`https://graph.facebook.com/v18.0/${FACEBOOK_PAGE_ID}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_url: link,
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
        return res.status(400).json({ error: fbResult.error.message });
      }

      // Update status to posted
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
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(400).json({ error: 'Invalid request' });
}
