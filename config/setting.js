require('dotenv').config()
const fs = require('fs')
const path = require('path')

if (!process.env.BOT_TOKEN || !process.env.API_ID || !process.env.API_HASH) {
  console.error('❌ Environment variables tidak lengkap')
  console.log('Pastikan file .env berisi:')
  console.log('BOT_TOKEN=your_bot_token')
  console.log('API_ID=your_api_id')
  console.log('API_HASH=your_api_hash')
  process.exit(1)
}

const sessionsDir = path.join(__dirname, '../sessions')
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true })

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  API_ID: parseInt(process.env.API_ID),
  API_HASH: process.env.API_HASH,
  sessionsDir
}