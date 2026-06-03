export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY, TABLE_NAME } = process.env;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TABLE_NAME) {
    return res.status(500).json({ error: 'Missing environment variables' });
  }

  const { action, id, data } = req.body || {};

  try {
    // GET - Fetch all rows
    if (req.method === 'GET') {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?select=*`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      const result = await response.json();
      return res.status(200).json(result);
    }

    // POST - Edit row (update)
    if (req.method === 'POST' && action === 'edit') {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
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
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
