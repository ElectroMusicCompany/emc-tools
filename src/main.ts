import { Client, GuildMemberRoleManager, Interaction } from 'discord.js';
import dotenv from 'dotenv';
import { SpotifyApi, AccessToken } from '@spotify/web-api-ts-sdk';
import { parse } from 'node-html-parser';

// .envの読み取り
dotenv.config();

// 初期化用
const client = new Client({ intents: ['Guilds', 'GuildMessages', 'MessageContent', 'GuildMembers'] });

let spotify: SpotifyApi;

// SongWhipのレスポンス
interface SongWhip {
  type: 'album' | 'track' | 'playlist';
  id: string;
  path: string;
  pagePath: string;
  name: string;
  image: string;
  links: {
    qobuz: boolean;
    tidal: boolean;
    amazon: boolean;
    deezer: boolean;
    itunes: boolean;
    pandora: boolean;
    spotify: boolean;
    youtube: boolean;
    soundcoud: boolean;
    amazonMusic: boolean;
    itunesMusic: boolean;
    youtubeMusic: boolean;
  };
  linksCountries: string[];
  sourceCountry: string;
  artists: any[];
  createdAtTimestamp: number;
  refreshedAtTimestamp: number;
  url: string;
}

// Discord Bot起動時の処理
client.once('ready', async () => {
  console.log('Ready!');
  console.log(client.user?.tag);
  console.log(
    `https://accounts.spotify.com/authorize?client_id=${process.env.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${process.env.SPOTIFY_REDIRECT_URI}&scope=playlist-modify-public%20playlist-modify-private`,
  );
});

// スラッシュコマンドの処理
client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.isCommand()) {
    return;
  }
  const { commandName, options } = interaction;
  // 反応確認
  if (commandName === 'ping') {
    await interaction.reply('Pong!');
  }
  // Spotifyの認証
  if (commandName === 'auth_spotify') {
    // URLがあれば、トークンを取得
    if (options.get('url') !== null) {
      // 中身は上と一緒
      await interaction.deferReply();
      const url = new URLSearchParams(options.get('url')!.value as string);
      const code = url.get('code');
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
          ).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: process.env.SPOTIFY_REDIRECT_URI || '',
        }),
      });
      const data = await res.json();
      delete data.scope;
      data.expires = data.expires_in * 1000 + Date.now();
      const spotifyToken = data as AccessToken;
      spotify = SpotifyApi.withAccessToken(process.env.SPOTIFY_CLIENT_ID || '', spotifyToken);
      await interaction.reply({ content: 'Authenticated with Spotify!', ephemeral: true });
    } else {
      // URLがなければ、URLを返す
      await interaction.reply({
        content: `https://accounts.spotify.com/authorize?client_id=${process.env.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${process.env.SPOTIFY_REDIRECT_URI}&scope=playlist-modify-public%20playlist-modify-private`,
        ephemeral: true,
      });
      await interaction.followUp({
        content: 'SpotifyのコールバックURLをコマンドに入れてください。\n`/auth_spotify url:YOUR_URL`',
        ephemeral: true,
      });
    }
  }
});

// メッセージの処理
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  // 正規表現で音楽サブスクURLを抽出
  const musicRegex =
    /(?:http:\/\/|https:\/\/)?(?:[a-z0-9]*[\-\.])*(?:apple|spotify|youtube|youtu|bandcamp|tidal|pandora|napster|yandex|amazon|deezer|jiosaavn|audius|gaana|soundcloud|page)\.(?:com|co|link|be)(?:\/[^ |\n|\t|\"|\']*)+/;

  if (musicRegex.test(message.content)) {
    const musicUrl = message.content.match(musicRegex)![0];
    // SongWhipにURLを投げて、SpotifyのURLを取得
    const res = await fetch(`https://songwhip.com`, {
      method: 'POST',
      body: JSON.stringify({ url: musicUrl }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const data: SongWhip = await res.json();
    // SpotifyのURLがあれば、Spotifyのプレイリストに追加
    if (data.links.spotify) {
      try {
      // SongWhipのページをスクレイピングして、SpotifyのURLを取得
      const servicesRes = await fetch(data.url);
      const servicesData = parse(await servicesRes.text());
      // <a>タグの中からSpotifyのURLを取得
      const spotifyTags = Array.from(servicesData.querySelectorAll('a')).filter((tag) =>
        tag.text.includes('Spotify'),
      )[0];
      const spotifyId = spotifyTags.getAttribute('href')!.split('/').pop() || '';
      // SpotifyのAPIを使って、曲の情報を取得
      const songData = await spotify.tracks.get(spotifyId);
      // プレイリストに追加
      await spotify.playlists.addItemsToPlaylist(process.env.SPOTIFY_PLAYLIST_ID || '', [songData.uri]);
      } catch (e) {
        console.error(e);
        message.reply('Spotifyのプレイリストに追加できませんでした。\n`/auth_spotify`で認証してください。');
      }
    }
    message.reply(data.url);
  }
});

client.login(process.env.TOKEN);
