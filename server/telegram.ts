export async function sendTelegramAlert(data: {
  page: string;
  referrer: string;
  ip: string;
  userAgent: string;
  isReturning?: string;
  theme?: string;
  inputType?: string;
  downlink?: string;
  screen?: string;
  memory?: string;
  cores?: string | number;
  lang?: string;
}): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) return;

  let locationInfo = 'Unknown Location';
  let ispInfo = 'Unknown ISP';
  
  if (data.ip && data.ip !== '127.0.0.1' && data.ip !== '::1') {
    try {
      const geoRes = await fetch(`https://ipapi.co/${data.ip}/json/`);
      if (geoRes.ok) {
        const geoData = await geoRes.json() as { city?: string; country_name?: string; org?: string };
        if (geoData.city && geoData.country_name) {
          locationInfo = `${geoData.city}, ${geoData.country_name}`;
        }
        if (geoData.org) ispInfo = geoData.org;
      }
    } catch (e) {
      console.error('Geolocation error:', e);
    }
  } else {
    locationInfo = 'Localhost / Development';
  }

  const timeTunis = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Tunis' });

  const message = `
🚀 *Ultimate Visitor Telemetry - NovaStore*
📄 *Page:* \`${data.page}\`
👤 *Status:* ${data.isReturning || 'New Visitor'}
🔗 *Referrer:* ${data.referrer}
📍 *Location:* ${locationInfo}
🏢 *ISP:* ${ispInfo}
🌐 *IP:* \`${data.ip}\`
🖥 *Display:* ${data.screen || 'N/A'} | ${data.theme || 'N/A'}
💻 *Device Type:* ${data.inputType || 'N/A'}
⚙️ *Hardware:* ${data.cores} Cores | ~${data.memory} RAM | Lang: ${data.lang}
⚡ *Network Speed:* Downlink: \`${data.downlink || 'N/A'}\`
📱 *User-Agent:* ${data.userAgent.substring(0, 50)}...
🕒 *Time (TN):* ${timeTunis}
  `.trim();

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
    }),
  });
}