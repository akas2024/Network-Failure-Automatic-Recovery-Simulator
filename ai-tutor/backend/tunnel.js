const ngrok = require('@ngrok/ngrok');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

(async function startTunnel() {
    const port = process.env.PORT || 5000;
    const authtoken = process.env.NGROK_AUTHTOKEN;

    console.log(`\n📡 Connecting ngrok tunnel to local port ${port}...`);

    try {
        const listener = await ngrok.forward({
            addr: Number(port),
            authtoken: authtoken || undefined
        });

        console.log('\n============================================================');
        console.log('🚀 NGROK TUNNEL IS ACTIVE!');
        console.log(`🌐 Public URL : ${listener.url()}`);
        console.log(`💻 Local URL  : http://localhost:${port}`);
        console.log('============================================================');
        console.log('\nPress Ctrl + C to stop the tunnel.\n');

        // Keep process running
        process.stdin.resume();
    } catch (err) {
        if (err.message && (err.message.includes('ERR_NGROK_4018') || err.message.includes('not authenticated'))) {
            console.error('\n⚠️  NGROK AUTHTOKEN IS REQUIRED');
            console.error('------------------------------------------------------------');
            console.error('Ngrok requires a free account to generate public URLs.');
            console.error('1. Sign in or sign up at: https://dashboard.ngrok.com/signup');
            console.error('2. Copy your AuthToken from: https://dashboard.ngrok.com/get-started/your-authtoken');
            console.error('3. Add it to your ai-tutor/backend/.env file:');
            console.error('   NGROK_AUTHTOKEN=your_token_here');
            console.error('4. Then re-run: npm run tunnel\n');
        } else {
            console.error('Ngrok Error:', err.message);
        }
    }
})();
