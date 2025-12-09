import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'
import { execSync } from 'child_process'

// ビルド番号を取得（Gitコミット数）
const getBuildNumber = () => {
  try {
    return execSync('git rev-list --count HEAD').toString().trim()
  } catch (error) {
    return '0'
  }
}

export default defineConfig({
  define: {
    __BUILD_NUMBER__: JSON.stringify(getBuildNumber())
  },
  plugins: [
    build(),
    devServer({
      adapter,
      entry: 'src/index.tsx'
    })
  ]
})
