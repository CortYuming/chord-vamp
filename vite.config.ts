import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// yt-loop, served next door while developing.
//
// In production the two apps are neighbours under one host -- /yt-loop/ and
// /chord-vamp/ -- and every link between them is written relative to that. A
// dev server holding only this app has no neighbour, so the round trip cannot
// be walked: the button out leads to a 404, and the way back in cannot be
// tested at all. This mounts the sibling checkout at the path it will have in
// production, so the link written here is the link that ships.
//
// Serve only: nothing of it reaches a build, and a checkout that is not there
// costs a warning rather than a failed start. Point YT_LOOP_DIR somewhere else
// if yt-loop does not sit beside this repo.
function ytLoopNextDoor(): Plugin {
  const root = path.resolve(process.env.YT_LOOP_DIR ?? '../yt-loop')
  const TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
  }
  return {
    name: 'yt-loop-next-door',
    apply: 'serve',
    configureServer(server) {
      if (!fs.existsSync(root)) {
        server.config.logger.warn(
          `[yt-loop-next-door] nothing at ${root} — /yt-loop/ will 404. ` +
          'Set YT_LOOP_DIR to the checkout to walk the round trip.',
        )
        return
      }
      server.middlewares.use('/yt-loop', (req, res, next) => {
        const asked = decodeURIComponent((req.url ?? '/').split('?')[0])
        const file = path.join(root, asked === '/' ? 'index.html' : asked)
        // Nothing outside the checkout, whatever the path asks for.
        if (file !== root && !file.startsWith(root + path.sep)) return next()
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return next()
        res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/chord-vamp/',
  plugins: [react(), ytLoopNextDoor()],
})
