cordova.define("cordova-plugin-media.Media", function(require, exports, module) {
/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
 */

var argscheck = require("cordova/argscheck"),
    utils = require("cordova/utils"),
    exec = require("cordova/exec");

var mediaObjects = {};
var emptyFn = (() => {});

/**
 * This class provides access to the device media, interfaces to both sound and video
 *
 * @constructor
 * @param src                   The file name or url to play
 * @param successCallback       The callback to be called when the file is done playing or recording.
 *                                  successCallback()
 * @param errorCallback         The callback to be called if there is an error.
 *                                  errorCallback(int errorCode) - OPTIONAL
 * @param statusCallback        The callback to be called when media status has changed.
 *                                  statusCallback(int statusCode) - OPTIONAL
 * @param positionCallback      The callback to be called when the file is playing
 *                                  successCallback(int remaining)
 */
var Media = function(src, successCallback, errorCallback, statusCallback, positionCallback) {
    argscheck.checkArgs("sFFF", "Media", arguments);
    this.id = utils.createUUID();
    mediaObjects[this.id] = this;
    this.src = src;
    this.successCallback = successCallback ||  emptyFn;
    this.errorCallback = errorCallback ||  emptyFn;
    this.statusCallback = statusCallback ||  emptyFn;
    this.positionCallback = positionCallback ||  emptyFn;
    this._duration = -1;
    this._position = -1;
    this._remaining = -1;
    exec(null, this.errorCallback, "Media", "create", [this.id, this.src, this._fadeTime]);

    this._mediaState = 0;

	this._primary = true;
    this._playing = false;
    this._paused = true;
    this._ended = false;
    this._loading = false;
    this._stopped = true;
    this._volume = 1;
    this._fadeIn = false;
    this._fadeOut = false;
    this._fadeTime = 0;
	this._fadingOut = false;
    this._playlistIndex = -1;
    this._setInterval = 0;
};

// Media messages
Media.MEDIA_STATE = 1;
Media.MEDIA_DURATION = 2;
Media.MEDIA_POSITION = 3;
Media.MEDIA_ERROR = 9;

// Media states
Media.MEDIA_NONE = 0;
Media.MEDIA_STARTING = 1;
Media.MEDIA_RUNNING = 2;
Media.MEDIA_PAUSED = 3;
Media.MEDIA_STOPPED = 4;
Media.MEDIA_ENDED = 5;
Media.MEDIA_FADING_OUT = 6;
Media.MEDIA_MSG = ["None", "Starting", "Running", "Paused", "Stopped", "Ended", "FadingOut"];

// "static" function to return existing objs.
Media.get = function(id) {
	return mediaObjects[id];
};

// "static" function to list existing objs.
Media.list = function() {
	return mediaObjects;
};
// "static" function to list existing objs.
Media.getAll = function() {
	return Object.keys(Media.list()).map(key => Media.list()[key]);
};
Media.running = function() {
	return Object.keys(Media.list()).map(key => Media.list()[key]).filter(x=> x._mediaState == Media.MEDIA_RUNNING);
};

Media.primary = function() {
	return Object.keys(Media.list()).map(key => Media.list()[key]).filter(x=> x._primary);
};

Media.secondary = function() {
	return Object.keys(Media.list()).map(key => Media.list()[key]).filter(x=> !x._primary);
};

Media.prototype.play = function(options) {
	var me = this;
    this.setFadeTime(options ? options.fadeTime : 0);
	exec(null, null, "Media", "startPlayingAudio", [this.id, this.src, this.fadeTime]);
};

/**
 * Stop playing audio file.
 */
Media.prototype.stop = function() {
	var me = this;
    me._position = 0;
	exec(
		function() {
			me._position = 0;
		},
		this.errorCallback,
		"Media",
		"stopPlayingAudio",
		[this.id]
	);
};

/**
 * Seek or jump to a new time in the track..
 */
Media.prototype.seekTo = function(milliseconds) {
    var me = this;
    exec(function(p) {
        me._position = p;
    }, this.errorCallback, "Media", "seekToAudio", [this.id, milliseconds]);
};

/**
 * Pause playing audio file.
 */
Media.prototype.pause = function() {
    this._paused = true;
    exec(null, this.errorCallback, "Media", "pausePlayingAudio", [this.id]);
};

Media.prototype.id = function() {
    var me = this;
    return me.id;
};
Media.prototype.src = function() {
    var me = this;
    return me.src;
};
/**
 * Get duration of an audio file.
 * The duration is only set for audio that is playing, paused or stopped.
 *
 * @return      duration or -1 if not known.
 */
Media.prototype.getDuration = function() {
    var me = this;
    return me._duration;
};
Media.prototype.getPosition = function() {
    var me = this;
    return me._position;
};
Media.prototype.getMediaState = function() {
    var me = this;
    return me._mediaState;
};
Media.prototype.getState = function() {
    var me = this;
    return Media.MEDIA_MSG[me._mediaState] || "";
};
/**
 * Specific statuses
 */
Media.prototype.getPaused = function() {
    var me = this;
    return me._paused;
};
Media.prototype.getPlaying = function() {
    var me = this;
    return me._playing;
};
Media.prototype.getEnded = function() {
    var me = this;
    return me._ended;
};
Media.prototype.getLoading = function() {
    var me = this;
    return me._loading;
};
Media.prototype.getStopped = function() {
    var me = this;
    return me._stopped;
};

Media.prototype.getPrimary = function() {
	var me = this;
	return me._primary;
};
Media.prototype.setPrimary = function(value) {
	var me = this;
	return (me._primary = value);
};

/**
 * Fade timings
 */
Media.prototype.getFadeIn = function() {
    var me = this;
    return me._fadeIn;
};
Media.prototype.setFadeIn = function(value) {
    var me = this;
    return me._fadeIn = value;
};
Media.prototype.getFadeOut = function() {
    var me = this;
    return me._fadeOut;
};
Media.prototype.setFadeOut = function(value) {
    var me = this;
    return me._fadeOut = value;
};
Media.prototype.setFadeTime = function(value) {
	var me = this;
	return (me._fadeTime = value);
};
Media.prototype.getFadingOut = function() {
	var me = this;
	return me._fadingOut;
};
Media.prototype.setFadingOut = function(value) {
	var me = this;
	return (me._fadingOut = value);
};

/**
 * Playlist index and Media Instance Number
 */
Media.prototype.getMediaIndex = function() {
    var me = this;
    return me._playlistIndex;
};
Media.prototype.setMediaIndex = function(value) {
    var me = this;
    return (me._playlistIndex = value);
};

/**
 * Get position of audio.
 */
Media.prototype.getCurrentPosition = function(success, fail) {
    var me = this;
    exec(function(p) {
        me._position = p;
        success(p);
    }, fail, "Media", "getCurrentPositionAudio", [this.id]);
};
/**
 * Update position.
 */
Media.prototype.updatePosition = function() {
    var me = this;
    exec(p => me._position = p, this.errorCallback, "Media", "getCurrentPositionAudio", [this.id]);
};

/**
 * Start recording audio file.
 */
Media.prototype.startRecord = function() {
    exec(null, this.errorCallback, "Media", "startRecordingAudio", [this.id, this.src]);
};

/**
 * Stop recording audio file.
 */
Media.prototype.stopRecord = function() {
    exec(null, this.errorCallback, "Media", "stopRecordingAudio", [this.id]);
};

/**
 * Pause recording audio file.
 */
Media.prototype.pauseRecord = function() {
    exec(null, this.errorCallback, "Media", "pauseRecordingAudio", [this.id]);
};

/**
 * Resume recording audio file.
 */
Media.prototype.resumeRecord = function() {
    exec(null, this.errorCallback, "Media", "resumeRecordingAudio", [this.id]);
};

/**
 * Release the resources.
 */
Media.prototype.release = function() {
    exec(null, this.errorCallback, "Media", "release", [this.id]);
};

/**
 * Adjust the volume.
 */
Media.prototype.setVolume = function(volume) {
    exec(null, null, "Media", "setVolume", [this.id, volume]);
    this._volume = volume;
};
Media.prototype.getVolume = function() {
    var me = this;
    return me._volume;
};
Media.prototype.setFadeVolume = function(fadeVolume) {
    exec(null, null, "Media", "setVolume", [this.id, fadeVolume]);
};

/**
 * Adjust the playback rate.
 */
Media.prototype.setRate = function(rate) {
    if (cordova.platformId === 'ios'){
        exec(null, null, "Media", "setRate", [this.id, rate]);
    } else {
        console.warn('media.setRate method is currently not supported for', cordova.platformId, 'platform.');
    }
};

/**
 * Get amplitude of audio.
 */
Media.prototype.getCurrentAmplitude = function(success, fail) {
    exec(function(p) {
        success(p);
    }, fail, "Media", "getCurrentAmplitudeAudio", [this.id]);
};

Media.prototype.enableAutoUpdate = function(me) {
    exec(p => { me._position = p; me.setFadeInOut() }, me.errorCallback, "Media", "getCurrentPositionAudio", [me.id]);
    if (me._setInterval == 0) {
        
        me._setInterval = setInterval(() => exec(p => { me._position = p; me.setFadeInOut() }, me.errorCallback, "Media", "getCurrentPositionAudio", [me.id]), 250);
    }
}
Media.prototype.disableAutoUpdate = function(me) {
    clearInterval(me._setInterval);
    me._setInterval = 0;
    
}
/**
 * When set, update FadeIn and FadeOut
 */
Media.prototype.setFadeInOut = function() {
	var me = this;
	const fadeOutZone = me._fadeOut && me._fadeTime >= me._remaining && me._position > me._fadeTime;
	const fadeInZone = me._fadeIn && me._fadeTime > me._position;

	// // FadeOut - equal power: from 100% to 0%
	// Math.sqrt(0.5 + 0.5 * Math.cos(Math.PI * x));
	// Math.cos((1 - x) * 0.5 * Math.PI);
	// // FadeIn - equal power: from 0% to 100%
	// Math.sqrt(0.5 - 0.5 * Math.cos(Math.PI * x));
	// Math.cos(x * 0.5 * Math.PI);

	// FadeOut
	if (fadeOutZone) {
		if (!me._fadingOut){
			//ensures only one FadingOut event sent
            console.log("fading Out false, setting to true and statusCallback 6")
			me._fadingOut = true;
			me.statusCallback(Media.MEDIA_FADING_OUT);
		}
		
		const x = me._remaining / this._fadeTime;
		const fadeFactor = Math.sqrt(0.5 - 0.5 * Math.cos(Math.PI * x));
		me.setFadeVolume(parseFloat(fadeFactor));
	}
	//Fadein
	if (fadeInZone) {
		const x = me._position / this._fadeTime;
		const fadeFactor = Math.sqrt(0.5 - 0.5 * Math.cos(Math.PI * x));
		me.setFadeVolume(parseFloat(fadeFactor));
	}
};

/**
 * Audio has status update.
 * PRIVATE
 *
 * @param id            The media object id (string)
 * @param msgType       The 'type' of update this is
 * @param value         Use of value is determined by the msgType
 */
Media.onStatus = function(id, msgType, value) {
    var media = mediaObjects[id];

    if (media) {
        switch (msgType) {
            case Media.MEDIA_STATE:
                media._mediaState = value;
                media._playing = value == Media.MEDIA_RUNNING;
                media._loading = value == Media.MEDIA_STARTING;
                media._stopped = value == Media.MEDIA_STOPPED;
                media._paused = value == Media.MEDIA_PAUSED;
				media._ended = value == Media.MEDIA_ENDED;
                media.statusCallback(value);
                
                media._mediaState == Media.MEDIA_RUNNING
                ? media.enableAutoUpdate(media)
                : media.disableAutoUpdate(media);
                break;
                
            case Media.MEDIA_DURATION:
                media._duration = value;
                break;

            case Media.MEDIA_ERROR:
                media.errorCallback(value);
                break;

            case Media.MEDIA_POSITION:
                media._position = Number(value);
                media._remaining = media._duration - media._position;                
                media.positionCallback(media._remaining);
                break;
            default:
                if (console.error) {
                    console.error("Unhandled Media.onStatus :: " + msgType);
                }
                break;
        }
                
    } else if (console.error) {
        console.error("Received Media.onStatus callback for unknown media :: " + id);
    }
};

module.exports = Media;

function onMessageFromNative(msg) {
    if (msg.action == 'status') {
        Media.onStatus(msg.status.id, msg.status.msgType, msg.status.value);
    } else {
        throw new Error('Unknown media action' + msg.action);
    }
}

if (cordova.platformId === 'android' || cordova.platformId === 'amazon-fireos' || cordova.platformId === 'windowsphone') {

    var channel = require('cordova/channel');

    channel.createSticky('onMediaPluginReady');
    channel.waitForInitialization('onMediaPluginReady');

    channel.onCordovaReady.subscribe(function() {
        exec(onMessageFromNative, undefined, 'Media', 'messageChannel', []);
        channel.initializationComplete('onMediaPluginReady');
    });
}
});
