// メール送信モック
// 本番環境ではSendGridなどを使用する想定
export async function sendVerificationEmail(email: string, token: string, baseUrl: string) {
  const verificationLink = `${baseUrl}/api/auth/verify-email?token=${token}`
  
  console.log('=================================================================')
  console.log('📧 [MOCK EMAIL] Verification Email Sent')
  console.log(`To: ${email}`)
  console.log(`Subject: Verify your email address`)
  console.log(`Body:`)
  console.log(`Please click the following link to verify your email address:`)
  console.log(verificationLink)
  console.log('=================================================================')
  
  // 実際にはここでメール送信APIを叩く
  // await sendgrid.send(...)
  
  return true
}
