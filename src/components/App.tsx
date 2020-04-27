import React from "react";
import CordovaAudioPlayerH5 from "./h5-audio-player/h5";
import "./h5-audio-player/styles.css";

export default class PlaylistApp extends React.PureComponent<{}, AppState> {
	componentWillMount(): void {
		this.state = { deviceReady: false, current: 0, isFading: false };
		document.addEventListener("deviceready", () => {
			this.setState({ deviceReady: true });
			console.log("loaded cordova");
		}, false);
	}

	doClickPrevious = (): void => {
		console.log("App received doClickPrevious, setting current -1");
		this.setState(prevState => ({ current: this.getPrevious(prevState.current) }));
	};
	doClickNext = (): void => {
		console.log("App received doClickNext, setting current +1");
		this.setState(prevState => ({ current: this.getNext(prevState.current) }));
	};

	getPlaylistByIndex(index: number): CordovaMediaPlaylist {
		return { ...playlist[index], index };
	}

	getNext(index: number) {
		return index < playlist.length - 1 ? index + 1 : 0
	}
	getPrevious(index: number) {
		return index === 0 ? playlist.length - 1 : index - 1
	}

	render() {
		const { current } = this.state;
		const fading = this.state.isFading;
		return this.state.deviceReady && (
			<div>
				<div className="playlist title-section">
					<h2>Playing now</h2>
					<div>
						<img className="img-size" src={playlist[current].cover}></img>
						<br />
					</div>

					<div>
						<h2 className="hhh">
							{playlist[current].track}
						</h2>
						<h3>
							{playlist[current].artist}
						</h3>
					</div>
				</div>

				<CordovaAudioPlayerH5
					onPlay={() => { }}
					onPause={() => { }}
					isFading={(value: boolean) => this.setState({ isFading: value })}
					showSkipControls={true}
					playlistLength={playlist.length}
					currentMusic={this.getPlaylistByIndex(current)}
					nextMusic={this.getPlaylistByIndex(this.getNext(current))}
					prevMusic={this.getPlaylistByIndex(this.getPrevious(current))}
					onClickPrevious={this.doClickPrevious}
					onClickNext={this.doClickNext}
				/>

				<label>
					<b>Playing next: </b><span>
						{playlist[this.getNext(current)].track} - {playlist[this.getNext(current)].artist}
					</span>
				</label>

				<div className="playlist-list">
					{playlist.map((item: CordovaMediaPlaylist, idx: number) => (
						<li key={idx} className={idx === current
							? "playlist-current"
							: fading && idx === this.getNext(current)
								? "playlist-next"
								: ""}>
							{item.track} - {item.artist} from {item.album}
							<br />
							Position: {idx}
							{fading && idx === current && <span className="fading">... fading in &nbsp;</span>}
							{fading && idx === this.getNext(current) && <span className="fading">... fading out &nbsp;</span>}
							<br />
							<br />
						</li>
					))}
				</div>
			</div>
		);
	}
}
type AppState = {
	deviceReady: boolean;
	isFading: boolean;
	current: number;
};
export interface CordovaMediaPlaylist {
	src: string;
	duration: number;
	track: string;
	artist: string;
	cover: string;
	title: string;
	album: string;
	index?: number;
	fadeTime?: number;
}

const playlist: CordovaMediaPlaylist[] = [
	{
		src:
			"https://d1490khl9dq1ow.cloudfront.net/audio/music/mp3preview/BsTwCwBHBjzwub4i4/the-one-30-seconds_Myg3YWVd_NWM.mp3",
		duration: 355,
		track: "The One",
		artist: "Gary Arnold",
		cover:
			"https://is3-ssl.mzstatic.com/image/thumb/Music1/v4/35/fb/9c/35fb9ce9-875d-4784-bd09-a7f5af6711f6/source/100x100bb.jpg",
		title: "The One 1",
		album: "A Night at the Opera",
	},
	{
		src:
			"https://d1490khl9dq1ow.cloudfront.net/audio/music/mp3preview/BsTwCwBHBjzwub4i4/hammerhead-30-seconds_f19NvW4d_NWM.mp3",
		duration: 259,
		track: "Hammerhead",
		artist: "Gary Arnold",
		cover:
			"https://is4-ssl.mzstatic.com/image/thumb/Music1/v4/b0/43/4d/b0434dcd-2cef-1a9d-a35d-486b8dbe2f2c/source/100x100bb.jpg",
		title: "Rock Hammer",
		album: "Rock",
	},
	{
		src:
			"https://d1490khl9dq1ow.cloudfront.net/audio/music/mp3preview/SxoktnUHBjzy8oizv/ssm-102518-Uplifting-Forward-Thinking-30-seconds-edit-01_NWM.mp3",
		duration: 306,
		track: "Uplifting Forward Thinking",
		artist: "Owen",
		cover:
			"https://is5-ssl.mzstatic.com/image/thumb/Music/v4/7c/98/53/7c985398-e846-6c5d-7d59-7b39f6494370/source/100x100bb.jpg",
		title: "Helix",
		album: "Examples",
	},
	{
		src:
			"https://d1490khl9dq1ow.cloudfront.net/audio/music/mp3preview/BsTwCwBHBjzwub4i4/zn-1117-special-30s-103_NWM.mp3",
		duration: 306,
		track: "Special Inspiring",
		artist: "SoundHelix",
		cover:
			"https://d2tml28x3t0b85.cloudfront.net/tracks/artworks/001/068/427/original/9cba71.jpeg?1561441376",
		title: "Helix",
		album: "Examples",
	},

	{
		src:
			"https://d1490khl9dq1ow.cloudfront.net/audio/music/mp3preview/BsTwCwBHBjzwub4i4/news-music-theme-30-seconds-countdown_zJiPo4VO_NWM.mp3",
		duration: 259,
		track: "News Music Theme",
		artist: "Bobby Cole",
		cover:
			"https://is4-ssl.mzstatic.com/image/thumb/Music1/v4/b0/43/4d/b0434dcd-2cef-1a9d-a35d-486b8dbe2f2c/source/100x100bb.jpg",
		title: "Stairway to Heaven 1",
		album: "Cinematic",
	},
	{
		src:
			"https://d1490khl9dq1ow.cloudfront.net/audio/music/mp3preview/BsTwCwBHBjzwub4i4/30-seconds-of-futuristic-technology_fy8v1HEu_NWM.mp3",
		duration: 249,
		track: "30 Seconds Of Futuristic Technology",
		artist: "Robert Gacek",
		cover:
			"https://d2tml28x3t0b85.cloudfront.net/tracks/artworks/001/068/427/original/9cba71.jpeg?1561441376",
		title: "Songs About Jane",
		album: "Hands All Over",
	},
	{
		src:
			"https://d1490khl9dq1ow.cloudfront.net/audio/music/mp3preview/BsTwCwBHBjzwub4i4/30-seconds-of-industry-news_GkKDkBNu_NWM.mp3",
		duration: 306,
		track: "Industry News",
		artist: "Robert Gacek",
		cover:
			"https://is5-ssl.mzstatic.com/image/thumb/Music/v4/7c/98/53/7c985398-e846-6c5d-7d59-7b39f6494370/source/100x100bb.jpg",
		title: "Sweet Child O'Mine 2",
		album: "Appetite for Destruction",
	},

	{
		src:
			"https://d1490khl9dq1ow.cloudfront.net/audio/music/mp3preview/BsTwCwBHBjzwub4i4/black-orchids-30-seconds_fySEnbVO_NWM.mp3",
		duration: 249,
		track: "Black Orchids",
		artist: "SoundHelix",
		cover:
			"https://d2tml28x3t0b85.cloudfront.net/tracks/artworks/001/068/427/original/9cba71.jpeg?1561441376",
		title: "Helix",
		album: "Examples",
	},
	{
		src:
			"https://d1490khl9dq1ow.cloudfront.net/audio/music/mp3preview/BsTwCwBHBjzwub4i4/powersurge-30-seconds_GJlwjWE__NWM.mp3",
		duration: 306,
		track: "Powersurge",
		artist: "Royalsongs",
		cover:
			"https://is3-ssl.mzstatic.com/image/thumb/Music1/v4/35/fb/9c/35fb9ce9-875d-4784-bd09-a7f5af6711f6/source/100x100bb.jpg",
		title: "Helix",
		album: "Examples",
	},
];
