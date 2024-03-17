import { Client, GuildMemberRoleManager, Interaction } from 'discord.js'
import dotenv from 'dotenv'
import { SpotifyApi, AccessToken } from '@spotify/web-api-ts-sdk';
import { parse } from 'node-html-parser'
import Fastify from 'fastify'

dotenv.config()

const client = new Client({ intents: ["Guilds", "GuildMessages", "MessageContent", "GuildMembers"] })

const fastify = Fastify()

let spotify: SpotifyApi

interface SongWhip {
  type: "album" | "track" | "playlist"
  id: string
  path: string
  pagePath: string
  name: string
  image: string
  links: {
    qobuz: boolean
    tidal: boolean
    amazon: boolean
    deezer: boolean
    itunes: boolean
    pandora: boolean
    spotify: boolean
    youtube: boolean
    soundcoud: boolean
    amazonMusic: boolean
    itunesMusic: boolean
    youtubeMusic: boolean
  }
  linksCountries: string[]
  sourceCountry: string
  artists: any[]
  createdAtTimestamp: number
  refreshedAtTimestamp: number
  url: string
}

fastify.get('/', async (request, reply) => {
  return { hello: 'world' }
})

fastify.get('/callback', async (request, reply) => {
  const { code } = request.query as { code: string }
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI || ""
    })
  })
  const data = await res.json()
  delete data.scope
  data.expires = data.expires_in * 1000 + Date.now()
  const spotifyToken = data as AccessToken
  spotify = SpotifyApi.withAccessToken(process.env.SPOTIFY_CLIENT_ID || "", spotifyToken)
  return { status: "OK" }
})

fastify.listen({ port: 3000 }, (err, address) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`Server listening on ${address}`)
})

client.once('ready', async () => {
  console.log('Ready!')
  console.log(client.user?.tag)
  console.log(`https://accounts.spotify.com/authorize?client_id=${process.env.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${process.env.SPOTIFY_REDIRECT_URI}&scope=playlist-modify-public%20playlist-modify-private`)
})

client.on("interactionCreate", async (interaction: Interaction) => {
  if (!interaction.isCommand()) {
    return
  }
  const { commandName, options } = interaction
  if (commandName === 'ping') {
    await interaction.reply('Pong!')
  }
  if (commandName === 'auth_spotify') {
    if ((interaction.member?.roles as GuildMemberRoleManager).cache.has(process.env.ADMIN_ROLE_ID || "")) {
      if (options.get("url")?.value !== null) {
        const url = new URLSearchParams(options.get("url")!.value as string)
        const code = url.get('code')
        const res = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code as string,
            redirect_uri: process.env.SPOTIFY_REDIRECT_URI || ""
          })
        })
        const data = await res.json()
        delete data.scope
        data.expires = data.expires_in * 1000 + Date.now()
        const spotifyToken = data as AccessToken
        spotify = SpotifyApi.withAccessToken(process.env.SPOTIFY_CLIENT_ID || "", spotifyToken)
        await interaction.reply({ content: "Authenticated with Spotify!", ephemeral: true })
      } else {
        await interaction.reply({content: `https://accounts.spotify.com/authorize?client_id=${process.env.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${process.env.SPOTIFY_REDIRECT_URI}&scope=playlist-modify-public%20playlist-modify-private`, ephemeral: true})
        await interaction.followUp({ content: "Please enter the code you received from Spotify.\n`/auth_spotify code:YOUR_URL", ephemeral: true })
      }
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return
  const musicRegex = /(?:http:\/\/|https:\/\/)?(?:[a-z0-9]*[\-\.])*(?:apple|spotify|youtube|youtu|bandcamp|tidal|pandora|napster|yandex|amazon|deezer|jiosaavn|audius|gaana|soundcloud|page)\.(?:com|co|link|be)(?:\/[^ |\n|\t|\"|\']*)+/

  if (musicRegex.test(message.content)) {
    const musicUrl = message.content.match(musicRegex)![0]
    const res = await fetch(`https://songwhip.com`, {
      method: 'POST',
      body: JSON.stringify({ url: musicUrl }),
      headers: {
        'Content-Type': 'application/json'
      }
    })
    const data: SongWhip = await res.json()
    if (data.links.spotify) {
      const servicesRes = await fetch(data.url)
      const servicesData = parse(await servicesRes.text())
      // Find tags containing the word Spotify in <a> <div>.
      const spotifyTags = Array.from(servicesData.querySelectorAll('a')).filter(tag => tag.text.includes('Spotify'))[0]
      const spotifyId = spotifyTags.getAttribute('href')!.split('/').pop() || ""
      const songData = await spotify.tracks.get(spotifyId)
      await spotify.playlists.addItemsToPlaylist(process.env.SPOTIFY_PLAYLIST_ID || "", [songData.uri])
    }
    message.reply(data.url)
  }
});

client.login(process.env.TOKEN)
