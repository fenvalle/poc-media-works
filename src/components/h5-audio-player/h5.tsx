// @ts-ignore
import React from "react";
import { Icon } from "@iconify/react";
import playCircle from "@iconify/icons-mdi/play-circle";
import pauseCircle from "@iconify/icons-mdi/pause-circle";
import skipPrevious from "@iconify/icons-mdi/skip-previous";
import skipNext from "@iconify/icons-mdi/skip-next";
import volumeHigh from "@iconify/icons-mdi/volume-high";
import volumeMute from "@iconify/icons-mdi/volume-mute";
import repeat from "@iconify/icons-mdi/repeat";
import repeatOff from "@iconify/icons-mdi/repeat-off";
import { CordovaMediaPlaylist } from "components/App";

export default class H5AudioPlayer extends React.PureComponent<PlayerProps, PlayerState> {
	state: PlayerState;
	audioVolume = 0;
	volumeControl?: HTMLElement;
	progressBar?: HTMLElement;
	container?: HTMLElement;
	lastVolume: number; //To store the volume before clicking mute button
	timeOnMouseMove: number; // Audio's current time while mouse is down and moving over the progress bar
	volumeAnimationTimer?: number;
	primaryID!: string; //primary with definite assert and second possible undefined
	secondID: string | null = null;

	static defaultProps = {
		loop: false,
		muted: false,
		volumeJumpStep: 0.1,
		progressJumpStep: 5000,
		volume: 1.0,
		showLoopControl: false,
		showVolumeControl: false,
		showSkipControls: false,
		playlistLength: 1,
		onError: () => { },
		onPause: () => { },
		onPlay: () => { },
		onClickPrevious: () => { },
		onClickNext: () => { },
		onPlayError: () => { },
	};

	//#region "Initilialize"
	constructor(props: PlayerProps) {
		super(props);
		const { volume, muted } = props;
		this.state = {
			currentTimePos: "0%",
			currentVolumePos: muted ? "0%" : `${volume * 100}%`,
			isDraggingProgress: false,
			isDraggingVolume: false,
			isLoopEnabled: this.props.loop,
			hasVolumeAnimation: false,
			playedMedia: [],
			primaryDuration: -1,
			primaryPosition: -1,
		};
		this.timeOnMouseMove = 0;
		this.lastVolume = volume || 0;
		this.audioVolume = this.props.muted ? 0 : this.lastVolume;

		const { currentMusic, nextMusic } = this.props;
		this.setState({
			playedMedia: [
				...this.state.playedMedia,
				this.createMedia(currentMusic!, true, false, false, true),
				...(nextMusic ? [this.createMedia(nextMusic, false, false, true, true)] : []),
			],
		});

		this.buttonNext = this.buttonNext.bind(this);
		this.buttonPrevious = this.buttonPrevious.bind(this);
		this.mediaPlay = this.mediaPlay.bind(this);
		this.mediaPause = this.mediaPause.bind(this);
		this.mediaStop = this.mediaStop.bind(this);
		this.buttonNext = this.buttonNext.bind(this);
	
		this.initializeMusicControls();
	}

	initializeMusicControls(): void {
		console.log("initializing music controls");
		//@ts-ignore
		MusicControls.create(this.musicOptions(), null);
		//@ts-ignore
		MusicControls.subscribe((action: string) => {
			console.log("entrou no musicControlEvents", action);
			try {
				const { message } = JSON.parse(action);
				switch (message) {
					case "music-controls-next": return this.buttonNext();
					case "music-controls-previous": return this.buttonPrevious();
					case "music-controls-pause": return this.mediaPause();
					case "music-controls-play": return this.mediaPlay();
					case "music-controls-destroy": return this.mediaStop();
					case "music-controls-toggle-play-pause": return this.togglePlay();
					case "music-controls-media-button": return this.togglePlay();
					case "music-controls-headset-unplugged": return this.mediaPause();
					case "music-controls-headset-plugged": return this.mediaPlay();
					case "music-controls-seek-to":
						this.primaryInstance.seekTo(JSON.parse(action).position);
						return setTimeout(() => this.updateMusicControls(), 200);
				}
			} catch (e) { console.log("Problem with music Controls!!!", e) }
		});
		//@ts-ignore
		MusicControls.listen();
	}


	//#region "Media Methods"
	createMedia(
		playlistItem: CordovaMediaPlaylist,
		primary: boolean = true,
		autoPlay: boolean = false,
		fadeIn: boolean = true,
		fadeOut: boolean = true
	): Media {
		let media: Media = new Media(
			playlistItem.src,
			() => this.mediaSuccess(media),
			(error: MediaError) => this.mediaError(media, error),
			(status: number) => this.mediaStatusCallback(media, status),
			_ => this.updatePrimaryMediaPosition(media)
		);

		//after create media, I need to set instanceId, playList, volume, fadeIn, fadeOut, autoPlay
		media.setMediaIndex(playlistItem.index || 0);
		media.setFadeIn(fadeIn);
		media.setFadeOut(fadeOut);
		media.setVolume(this.props.muted ? 0 : this.props.volume);
		media.setFadeTime(playlistItem.fadeTime || 6);

		media.setPrimary(primary);
		primary ? (this.primaryID = media.id) : (this.secondID = media.id);

		if (primary) this.secondID = null;
		if (primary && autoPlay) this.mediaPlay();

		return media;
	}

	public get primaryInstance(): Media {
		return Media.get(this.primaryID);
	}
	public get secondInstance(): Media | undefined {
		return this.secondID ? Media.get(this.secondID) : undefined;
	}
	public get elapsed(): number {
		return !!this.primaryInstance && this.primaryInstance.getPosition();
	}
	public get isFading(): boolean {
		return (
			!!this.secondInstance && this.secondInstance.getPlaying() && this.primaryInstance.getPlaying()
		);
	}
	public get isPlaying(): boolean {
		return !!this.secondInstance && this.secondInstance.getPlaying()
			? true
			: this.primaryInstance.getPlaying();
	}
	public get isLoading(): boolean {
		return !!this.secondInstance && this.secondInstance.getLoading()
			? true
			: this.primaryInstance.getLoading();
	}

	mediaPlay(): void {
		this.primaryInstance.play({ fadeTime: 6 });
		this.primaryInstance.enableAutoUpdate(this.primaryInstance);
		this.createMusicControls();
	}
	mediaPause(): void {
		console.log("CM method Media Pause All");
		Media.getAll().forEach((m: Media) => m.pause());
	}
	mediaStop(): void {
		console.log("CM method Media Stop");
		Media.getAll().forEach((m: Media) => {
			m.stop();
			m.release();
		});
	}

	rewindCurrent() {
		this.props.onClickPrevious && this.props.onClickPrevious();
		console.log("sent to playlist to handle prev");
		this.mediaStop();
		this.createMedia(this.props.currentMusic!, true, true, false, true);
		this.createMedia(this.props.nextMusic!, false, false, true, true);
		return;
	}

	buttonPrevious() {
		if (this.primaryInstance && this.elapsed < 3) {
			return this.rewindCurrent();
		}

		this.primaryInstance.pause();
		this.primaryInstance.seekTo(0);
		this.secondInstance && this.secondInstance.pause();
		this.secondInstance && this.secondInstance.seekTo(0);
		this.mediaPlay();
		return;
		//only rewind music to start. Else load last
	}

	buttonNext() {
		console.log("sent to playlist to handle next");
		this.props.onClickNext && this.props.onClickNext();
		this.mediaStop();
		this.createMedia(this.props.currentMusic!, true, true, false, true);
		this.createMedia(this.props.nextMusic!, false, false, true, true);
	}

	replacePrimarySecond(): void {
		//the second is already playing and will become primary and the first become secondary
		if (!this.secondID) return;
		this.primaryID = this.secondID;
		this.primaryInstance.setPrimary(true);
		this.secondID = null;
		this.createMusicControls();
		this.forceUpdate();
		if (!this.props.nextMusic) return;
		this.createMedia(this.props.nextMusic!, false, false, true, true);
	}

	createMusicControls(): void {
		//@ts-ignore
		MusicControls.create(this.musicOptions(), null);
	}
	updateMusicControls(): void {
		//@ts-ignore
		MusicControls.updateElapsed({ elapsed: this.elapsed, isPlaying: this.isPlaying });
	}

	musicOptions(): Object {
		const { currentMusic } = this.props;
		return {
			dismissable: false,
			artist: currentMusic!.artist,
			track: currentMusic!.track,
			album: currentMusic!.album,
			cover: currentMusic!.cover,
			hasScrubbing: true,
			elapsed: this.elapsed,
			isPlaying: this.isPlaying,
			duration: this.primaryInstance.getDuration(),
			ticker: "Now Playing " + currentMusic!.track,
			playIcon: "media_play",
			pauseIcon: "media_pause",
			prevIcon: "media_prev",
			nextIcon: "media_next",
			closeIcon: "media_close",
			notificationIcon: "notification",
		};
	}

	//#endregion "Media Methods"

	private static addHeadingZero(num: number): string {
		return num > 9 ? num.toString() : `0${num}`;
	}

	private static getPosX(event: TouchEvent | MouseEvent): number {
		if (event instanceof MouseEvent) {
			return event.pageX || event.clientX;
		} else {
			return event.touches[0].pageX;
		}
	}

	private static getDisplayTimeBySeconds(seconds: number): string {
		if (!isFinite(seconds) || seconds < 0) {
			return "00:00";
		}

		const addHeadingZero = H5AudioPlayer.addHeadingZero;
		const min = addHeadingZero(Math.floor(seconds / 60));
		const sec = addHeadingZero(Math.floor(seconds % 60));
		return `${min}:${sec}`;
	}

	togglePlay = (e?: React.SyntheticEvent): void => {
		this.isPlaying ? this.mediaPause() : this.mediaPlay();
		e && e.stopPropagation();
	};

	handleClickVolumeButton = (): void => {
		if (this.audioVolume > 0) {
			this.lastVolume = this.audioVolume;
			this.audioVolume = 0;
		} else {
			this.audioVolume = this.lastVolume;
		}

		this.setState({
			hasVolumeAnimation: true,
			currentVolumePos: `${(this.audioVolume * 100).toFixed(0)}%`,
		});

		clearTimeout(this.volumeAnimationTimer);
		console.log("Volume", this.audioVolume);
		this.volumeAnimationTimer = setTimeout(() => this.setState({ hasVolumeAnimation: false }), 100);
	};

	handleVolumnControlMouseDown = (event: React.MouseEvent | React.TouchEvent): void => {
		event.stopPropagation();
		const { currentVolume, currentVolumePos } = this.getCurrentVolume(event.nativeEvent);
		this.audioVolume = currentVolume;
		this.setState({ isDraggingVolume: true, currentVolumePos });

		if (event.nativeEvent instanceof MouseEvent) {
			window.addEventListener("mousemove", this.handleWindowMouseOrTouchMove);
			window.addEventListener("mouseup", this.handleWindowMouseOrTouchUp);
		} else {
			window.addEventListener("touchmove", this.handleWindowMouseOrTouchMove);
			window.addEventListener("touchend", this.handleWindowMouseOrTouchUp);
		}
	};

	handleWindowMouseOrTouchMove = (event: TouchEvent | MouseEvent): void => {
		event.preventDefault();
		event.stopPropagation();

		// Prevent Chrome drag selection bug
		const windowSelection: Selection | null = window.getSelection();
		windowSelection && windowSelection.type === "Range" && windowSelection.empty();

		const { isDraggingVolume, isDraggingProgress } = this.state;
		if (isDraggingVolume) {
			const { currentVolume, currentVolumePos } = this.getCurrentVolume(event);
			this.audioVolume = currentVolume;
			this.setState({ currentVolumePos });
		}

		if (isDraggingProgress) {
			const { currentTime, currentTimePos } = this.getCurrentProgress(event);
			this.timeOnMouseMove = currentTime;
			this.setState({ currentTimePos });
		}
	};

	handleWindowMouseOrTouchUp = (event: MouseEvent | TouchEvent): void => {
		event.stopPropagation();
		this.setState(prevState => {
			if (prevState.isDraggingProgress && isFinite(this.timeOnMouseMove)) {
				//finish dragging - update audio position
				this.primaryInstance.seekTo(this.timeOnMouseMove);
				setTimeout(() => this.updateMusicControls(), 200);
			}
			if (prevState.isDraggingVolume && isFinite(this.audioVolume)) {
				//finish dragging - update audio volume
				this.primaryInstance.setVolume(this.audioVolume);
			}
			return { isDraggingVolume: false, isDraggingProgress: false };
		});

		if (event instanceof MouseEvent) {
			window.removeEventListener("mousemove", this.handleWindowMouseOrTouchMove);
			window.removeEventListener("mouseup", this.handleWindowMouseOrTouchUp);
		} else {
			window.removeEventListener("touchmove", this.handleWindowMouseOrTouchMove);
			window.removeEventListener("touchend", this.handleWindowMouseOrTouchUp);
		}
	};

	getCurrentVolume = (event: TouchEvent | MouseEvent): VolumePosInfo => {
		const volumeBarRect = this.volumeControl!.getBoundingClientRect();
		const maxRelativePos = volumeBarRect.width;
		const relativePos = H5AudioPlayer.getPosX(event) - volumeBarRect.left;

		const currentVolume = Math.min(Math.max(relativePos, 0) / maxRelativePos, 1);
		const currentVolumePos = `${currentVolume * 100}%`;
		return { currentVolume, currentVolumePos };
	};

	/* Handle mouse click on progress bar event */
	handleMouseDownProgressBar = (event: React.MouseEvent | React.TouchEvent): void => {
		event.stopPropagation();
		const { currentTime, currentTimePos } = this.getCurrentProgress(event.nativeEvent);
		if (isFinite(currentTime)) {
			this.timeOnMouseMove = currentTime;
			this.setState({ isDraggingProgress: true, currentTimePos });
			if (event.nativeEvent instanceof MouseEvent) {
				window.addEventListener("mousemove", this.handleWindowMouseOrTouchMove);
				window.addEventListener("mouseup", this.handleWindowMouseOrTouchUp);
			} else {
				window.addEventListener("touchmove", this.handleWindowMouseOrTouchMove);
				window.addEventListener("touchend", this.handleWindowMouseOrTouchUp);
			}
		}
	};
	buttonLoop = (): void => {
		this.setState(prevState => ({ isLoopEnabled: !prevState.isLoopEnabled }));
	};

	// handleClickRewind = (): void => {
	// 	this.setJumpTime(-this.props.progressJumpStep);
	// };
	// handleClickForward = (): void => {
	// 	this.setJumpTime(this.props.progressJumpStep);
	// };
	// setJumpTime = (time: number): void => {
	// 	const { duration, currentTime: prevTime } = this.audio;
	// 	if (!isFinite(duration) || !isFinite(prevTime)) return;
	// 	let currentTime = prevTime + time / 1000;
	// 	if (currentTime < 0) {
	// 		this.elapsed = 0;
	// 		currentTime = 0;
	// 	} else if (currentTime > duration) {
	// 		this.elapsed = duration;
	// 		currentTime = duration;
	// 	} else {
	// 		this.elapsed = currentTime;
	// 	}

	//
	// };

	setJumpVolume = (volume: number): void => {
		const newVolume = Math.min(Math.max(this.audioVolume + volume, 0), 1);
		this.audioVolume = newVolume;
		this.setState({ currentVolumePos: `${(newVolume * 100).toFixed(0)}%` });
	};

	getCurrentProgress = (event: MouseEvent | TouchEvent): TimePosInfo => {
		if (!(this.elapsed >= -1 && this.progressBar)) return { currentTime: 0, currentTimePos: "0%" };

		const progressBarRect = this.progressBar!.getBoundingClientRect();
		const maxRelativePos = progressBarRect.width;
		let relativePos = Math.min(
			maxRelativePos,
			Math.max(H5AudioPlayer.getPosX(event) - progressBarRect.left, 0)
		);
		const currentTime = (this.primaryInstance.getDuration() * relativePos) / maxRelativePos;
		return { currentTime, currentTimePos: `${((relativePos / maxRelativePos) * 100).toFixed(2)}%` };
	};

	handleKeyDown = (e: React.KeyboardEvent): void => {
		switch (e.keyCode) {
			case 32: // Space
				(e.target === this.container || e.target === this.progressBar) && this.togglePlay(e);
				break;
			case 38: // Up arrow
				this.setJumpVolume(this.props.volumeJumpStep);
				break;
			case 40: // Down arrow
				this.setJumpVolume(-this.props.volumeJumpStep);
				break;
			case 37: // Left arrow
				// this.handleClickRewind();
				this.buttonPrevious();
				break;
			case 39: // Right arrow
				// this.handleClickForward();
				this.buttonNext();
				break;
			case 76: // L = Loop
				this.buttonLoop();
				break;
			case 77: // M = Mute
				this.handleClickVolumeButton();
				break;
		}
	};

	componentWillUnmount(): void {
		clearTimeout(this.volumeAnimationTimer);
		this.mediaStop();
	}
	//#region Render
	render() {
		const { showLoopControl, showVolumeControl, showSkipControls, style } = this.props;
		const {
			currentTimePos,
			currentVolumePos,
			isLoopEnabled,
			hasVolumeAnimation,
			primaryDuration: duration,
			primaryPosition: currentTime,
		} = this.state;

		const volume = this.primaryInstance.getVolume();
		const isPlaying = this.isPlaying;

		return (
			<div
				role="group"
				ref={(ref: HTMLDivElement) => (this.container = ref)}
				tabIndex={0}
				aria-label="Audio Player"
				className={`rhap_container`}
				onKeyDown={this.handleKeyDown}
				style={style}
			>
				<div className="rhap_progress-section">
					<div id="rhap_current-time" className="rhap_time rhap_current-time">
						{H5AudioPlayer.getDisplayTimeBySeconds(currentTime)}
					</div>

					<div
						ref={(el: HTMLDivElement) => (this.progressBar = el)}
						className="rhpc"
						aria-label="Audio Progress Control"
						aria-describedby="rhap_current-time"
						role="progressbar"
						aria-valuemin={0}
						aria-valuemax={100}
						aria-valuenow={Number(currentTimePos.split("%")[0])}
						tabIndex={0}
						onMouseDown={this.handleMouseDownProgressBar}
						onTouchStart={this.handleMouseDownProgressBar}
					>
						<div className={`rhap_progress-bar`}>
							<div className="rhap_progress-indicator" style={{ left: currentTimePos }} />
						</div>
					</div>
					<div className="rhap_time">{H5AudioPlayer.getDisplayTimeBySeconds(duration)}</div>
					<div className="rhap_additional-controls">
						{showLoopControl && (
							<button
								aria-label={isLoopEnabled ? "Enable Loop" : "Disable Loop"}
								className="rhap_button-clear rhap_repeat-button"
								onClick={this.buttonLoop}
							>
								<Icon icon={isLoopEnabled ? repeat : repeatOff} />
							</button>
						)}
					</div>
				</div>
				<div className="rhap_controls-section">
					<div className="rhap_main-controls">
						{showSkipControls && (
							<button
								aria-label="Previous"
								className="rhap_button-clear rhmcb rhap_skip-button"
								onClick={this.buttonPrevious}
							>
								<Icon icon={skipPrevious} />
							</button>
						)}
						<button
							aria-label={isPlaying ? "Pause" : "Play"}
							className="rhap_button-clear rhap_main-controls-button rhap_play-pause-button"
							onClick={this.togglePlay}
						>
							{/* {this.isLoading && <div className="sp sp-wave rhap_button-clear rhap_main-controls-button rhap_play-pause-button"></div>} */}
							{isPlaying ? <Icon icon={pauseCircle} /> : <Icon icon={playCircle} />}
						</button>
						{showSkipControls && (
							<button
								aria-label="Skip"
								className="rhap_button-clear rhmcb rhap_skip-button"
								onClick={this.buttonNext}
							>
								<Icon icon={skipNext} />
							</button>
						)}
					</div>
				</div>

				<div className="rhap_volume-controls">
					{showVolumeControl && (
						<div className="rhap_volume-container">
							<button
								aria-label={volume ? "Mute" : "Unmute"}
								onClick={this.handleClickVolumeButton}
								className="rhap_button-clear rhap_volume-button"
							>
								<Icon icon={volume ? volumeHigh : volumeMute} />
							</button>
							<div
								ref={(el: HTMLDivElement) => (this.volumeControl = el)}
								onMouseDown={this.handleVolumnControlMouseDown}
								onTouchStart={this.handleVolumnControlMouseDown}
								role="progressbar"
								aria-label="volume Control"
								aria-valuemin={0}
								aria-valuemax={100}
								aria-valuenow={Number((volume * 100).toFixed(0))}
								tabIndex={0}
								className="rhap_volume-bar-area"
							>
								<div className="rhap_volume-bar">
									<div
										className="rhap_volume-indicator"
										style={{
											left: currentVolumePos,
											transitionDuration: hasVolumeAnimation ? ".1s" : "0s",
										}}
									/>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>
		);
	}
	//#endregion Render

	//#region "Callbacks"
	mediaError(media: Media, error: MediaError) {
		this.props && this.props.onError();
		console.log(`error CM ${JSON.stringify(error)} ${media.id}`);
	}
	mediaSuccess(media: Media) {
		console.log(`success CM ${media.id}`);
	}
	updatePrimaryMediaPosition(media: Media, started: boolean = true) {
		if (!media.getPrimary()) return;
		media.getPrimary() &&
			this.setState({
				currentTimePos: `${(media.getPosition() / Math.max(media.getDuration(), 0)) * 100}%`,
				primaryDuration: Math.max(media.getDuration(), 0), //ARRUMAR todos com 0
				primaryPosition: started ? media.getPosition() : 0,
			});
	}
	mediaStatusCallback = (media: Media, status: number) => {
		if (this.isPlaying && media.getStopped() && media.getPosition() > 0) status = Media.MEDIA_ENDED
		//temporary fix por simulator on browser,

		console.log(`CM RECEIVED STATUS ${Media.MEDIA_MSG[status]} ${media.id}`);
		switch (status) {
			case Media.MEDIA_STARTING:
				this.updatePrimaryMediaPosition(media, false);
				this.createMusicControls();
				break;
			case Media.MEDIA_RUNNING:
				this.props && this.props.onPlay();
				this.createMusicControls();
				break;
			case Media.MEDIA_PAUSED:
				this.props && this.props.onPause();
				this.updateMusicControls();
				break;
			case Media.MEDIA_STOPPED:
				this.props && this.props.onPause();
				this.updateMusicControls();
				break;
			case Media.MEDIA_ENDED:
				this.props && this.props.onClickNext();
				this.replacePrimarySecond();
				break;
			case Media.MEDIA_FADING_OUT:
				!!this.secondInstance && this.secondInstance.play({ fadeTime: 6 });
				break;
			default:
				break;
		}
		this.props && this.props.isFading(this.isFading);
		this.forceUpdate();
	};
}
//#endregion "Callbacks"

//#region "Interfaces"
interface PlayerProps {
	style?: React.CSSProperties;
	loop: boolean;
	muted: boolean;
	volumeJumpStep: number;
	progressJumpStep: number;
	volume: number;
	showLoopControl: boolean;
	showVolumeControl: boolean;
	showSkipControls: boolean;
	playlistLength: number;
	// three songs from list
	currentMusic?: CordovaMediaPlaylist;
	nextMusic?: CordovaMediaPlaylist;
	prevMusic?: CordovaMediaPlaylist;
	// Events passed via props
	onError: () => void;
	onPause: () => void;
	onPlay: () => void;
	onClickPrevious: () => void;
	onClickNext: () => void;
	isFading: (value: boolean) => void;
	onPlayError: (err: Error) => void;
}
interface PlayerState {
	currentTimePos: string;
	currentVolumePos: string;
	isDraggingProgress: boolean;
	isDraggingVolume: boolean;
	isLoopEnabled: boolean;
	hasVolumeAnimation: boolean;
	playedMedia: Media[];
	primaryDuration: number;
	primaryPosition: number;
}
interface TimePosInfo {
	currentTime: number;
	currentTimePos: string;
}
interface VolumePosInfo {
	currentVolume: number;
	currentVolumePos: string;
}
//#endregion "Interfaces"
