/*
 Licensed to the Apache Software Foundation (ASF) under one
 or more contributor license agreements.  See the NOTICE file
 distributed with this work for additional information
 regarding copyright ownership.  The ASF licenses this file
 to you under the Apache License, Version 2.0 (the
 "License"); you may not use this file except in compliance
 with the License.  You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing,
 software distributed under the License is distributed on an
 "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 KIND, either express or implied.  See the License for the
 specific language governing permissions and limitations
 under the License.
 */

#import "CDVSound.h"
#import "CDVFile.h"
#import <AVFoundation/AVFoundation.h>
#include <math.h>

#define DOCUMENTS_SCHEME_PREFIX @"documents://"
#define HTTP_SCHEME_PREFIX @"http://"
#define HTTPS_SCHEME_PREFIX @"https://"
#define CDVFILE_PREFIX @"cdvfile://"

@implementation CDVSound

BOOL keepAvAudioSessionAlwaysActive = YES;

@synthesize soundCache, avSession, currMediaId, statusCallbackId;

-(void) pluginInitialize
{
    NSDictionary* settings = self.commandDelegate.settings;
    keepAvAudioSessionAlwaysActive = [[settings objectForKey:[@"KeepAVAudioSessionAlwaysActive" lowercaseString]] boolValue];
    if (keepAvAudioSessionAlwaysActive) {
        if ([self hasAudioSession]) {
            NSError* error = nil;
            if(![self.avSession setActive:YES error:&error]) {
                NSLog(@"Unable to activate session: %@", [error localizedFailureReason]);
            }
        }
    }
}

// Maps a url for a resource path for recording
- (NSURL*)urlForRecording:(NSString*)resourcePath
{
    NSURL* resourceURL = nil;
    NSString* filePath = nil;
    NSString* docsPath = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES)[0];

    // first check for correct extension
    NSString* ext=[resourcePath pathExtension];
    if ([ext caseInsensitiveCompare:@"wav"] != NSOrderedSame &&
        [ext caseInsensitiveCompare:@"m4a"] != NSOrderedSame) {
        resourceURL = nil;
        NSLog(@"Resource for recording must have wav or m4a extension");
    } else if ([resourcePath hasPrefix:DOCUMENTS_SCHEME_PREFIX]) {
        // try to find Documents:// resources
        filePath = [resourcePath stringByReplacingOccurrencesOfString:DOCUMENTS_SCHEME_PREFIX withString:[NSString stringWithFormat:@"%@/", docsPath]];
        NSLog(@"Will use resource '%@' from the documents folder with path = %@", resourcePath, filePath);
    } else if ([resourcePath hasPrefix:CDVFILE_PREFIX]) {
        CDVFile *filePlugin = [self.commandDelegate getCommandInstance:@"File"];
        CDVFilesystemURL *url = [CDVFilesystemURL fileSystemURLWithString:resourcePath];
        filePath = [filePlugin filesystemPathForURL:url];
        if (filePath == nil) {
            resourceURL = [NSURL URLWithString:resourcePath];
        }
    } else {
        // if resourcePath is not from FileSystem put in tmp dir, else attempt to use provided resource path
        NSString* tmpPath = [NSTemporaryDirectory()stringByStandardizingPath];
        BOOL isTmp = [resourcePath rangeOfString:tmpPath].location != NSNotFound;
        BOOL isDoc = [resourcePath rangeOfString:docsPath].location != NSNotFound;
        if (!isTmp && !isDoc) {
            // put in temp dir
            filePath = [NSString stringWithFormat:@"%@/%@", tmpPath, resourcePath];
        } else {
            filePath = resourcePath;
        }
    }

    if (filePath != nil) {
        // create resourceURL
        resourceURL = [NSURL fileURLWithPath:filePath];
    }
    return resourceURL;
}

// Maps a url for a resource path for playing
// "Naked" resource paths are assumed to be from the www folder as its base
- (NSURL*)urlForPlaying:(NSString*)resourcePath
{
    NSURL* resourceURL = nil;
    NSString* filePath = nil;

    // first try to find HTTP:// or Documents:// resources

    if ([resourcePath hasPrefix:HTTP_SCHEME_PREFIX] || [resourcePath hasPrefix:HTTPS_SCHEME_PREFIX]) {
        // if it is a http url, use it
        NSLog(@"Will use resource '%@' from the Internet.", resourcePath);
        resourceURL = [NSURL URLWithString:resourcePath];
    } else if ([resourcePath hasPrefix:DOCUMENTS_SCHEME_PREFIX]) {
        NSString* docsPath = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES)[0];
        filePath = [resourcePath stringByReplacingOccurrencesOfString:DOCUMENTS_SCHEME_PREFIX withString:[NSString stringWithFormat:@"%@/", docsPath]];
        NSLog(@"Will use resource '%@' from the documents folder with path = %@", resourcePath, filePath);
    } else if ([resourcePath hasPrefix:CDVFILE_PREFIX]) {
        CDVFile *filePlugin = [self.commandDelegate getCommandInstance:@"File"];
        CDVFilesystemURL *url = [CDVFilesystemURL fileSystemURLWithString:resourcePath];
        filePath = [filePlugin filesystemPathForURL:url];
        if (filePath == nil) {
            resourceURL = [NSURL URLWithString:resourcePath];
        }
    } else {
        // attempt to find file path in www directory or LocalFileSystem.TEMPORARY directory
        filePath = [self.commandDelegate pathForResource:resourcePath];
        if (filePath == nil) {
            // see if this exists in the documents/temp directory from a previous recording
            NSString* testPath = [NSString stringWithFormat:@"%@/%@", [NSTemporaryDirectory()stringByStandardizingPath], resourcePath];
            if ([[NSFileManager defaultManager] fileExistsAtPath:testPath]) {
                // inefficient as existence will be checked again below but only way to determine if file exists from previous recording
                filePath = testPath;
                NSLog(@"Will attempt to use file resource from LocalFileSystem.TEMPORARY directory");
            } else {
                // attempt to use path provided
                filePath = resourcePath;
                NSLog(@"Will attempt to use file resource '%@'", filePath);
            }
        } else {
            NSLog(@"Found resource '%@' in the web folder.", filePath);
        }
    }
    // if the resourcePath resolved to a file path, check that file exists
    if (filePath != nil) {
        // create resourceURL
        resourceURL = [NSURL fileURLWithPath:filePath];
        // try to access file
        NSFileManager* fMgr = [NSFileManager defaultManager];
        if (![fMgr fileExistsAtPath:filePath]) {
            resourceURL = nil;
            NSLog(@"Unknown resource '%@'", resourcePath);
        }
    }

    return resourceURL;
}

// Creates or gets the cached audio file resource object
- (CDVAudioFile*)audioFileForResource:(NSString*)resourcePath withId:(NSString*)mediaId doValidation:(BOOL)bValidate forRecording:(BOOL)bRecord suppressValidationErrors:(BOOL)bSuppress
{
    BOOL bError = NO;
    CDVMediaError errcode = MEDIA_ERR_NONE_SUPPORTED;
    NSString* errMsg = @"";
    CDVAudioFile* audioFile = nil;
    NSURL* resourceURL = nil;

    if ([self soundCache] == nil) {
        [self setSoundCache:[NSMutableDictionary dictionaryWithCapacity:1]];
    } else {
        audioFile = [[self soundCache] objectForKey:mediaId];
    }
    if (audioFile == nil) {
        // validate resourcePath and create
        if ((resourcePath == nil) || ![resourcePath isKindOfClass:[NSString class]] || [resourcePath isEqualToString:@""]) {
            bError = YES;
            errcode = MEDIA_ERR_ABORTED;
            errMsg = @"invalid media src argument";
        } else {
            audioFile = [[CDVAudioFile alloc] init];
            audioFile.resourcePath = resourcePath;
            audioFile.resourceURL = nil;  // validate resourceURL when actually play or record
            [[self soundCache] setObject:audioFile forKey:mediaId];
        }
    }
    if (bValidate && (audioFile.resourceURL == nil)) {
        if (bRecord) {
            resourceURL = [self urlForRecording:resourcePath];
        } else {
            resourceURL = [self urlForPlaying:resourcePath];
        }
        if ((resourceURL == nil) && !bSuppress) {
            bError = YES;
            errcode = MEDIA_ERR_ABORTED;
            errMsg = [NSString stringWithFormat:@"Cannot use audio file from resource '%@'", resourcePath];
        } else {
            audioFile.resourceURL = resourceURL;
        }
    }

    if (bError) {
        [self onStatus:MEDIA_ERROR mediaId:mediaId param:
            [self createMediaErrorWithCode:errcode message:errMsg]];
    }

    return audioFile;
}

// Creates or gets the cached audio file resource object
- (CDVAudioFile*)audioFileForResource:(NSString*)resourcePath withId:(NSString*)mediaId doValidation:(BOOL)bValidate forRecording:(BOOL)bRecord
{
    return [self audioFileForResource:resourcePath withId:mediaId doValidation:bValidate forRecording:bRecord suppressValidationErrors:NO];
}

// returns whether or not audioSession is available - creates it if necessary
- (BOOL)hasAudioSession
{
    BOOL bSession = YES;

    if (!self.avSession) {
        NSError* error = nil;

        self.avSession = [AVAudioSession sharedInstance];
        if (error) {
            // is not fatal if can't get AVAudioSession , just log the error
            NSLog(@"error creating audio session: %@", [[error userInfo] description]);
            self.avSession = nil;
            bSession = NO;
        }
    }
    return bSession;
}

// helper function to create a error object string
- (NSDictionary*)createMediaErrorWithCode:(CDVMediaError)code message:(NSString*)message
{
    NSMutableDictionary* errorDict = [NSMutableDictionary dictionaryWithCapacity:2];

    [errorDict setObject:[NSNumber numberWithUnsignedInteger:code] forKey:@"code"];
    [errorDict setObject:message ? message:@"" forKey:@"message"];
    return errorDict;
}

//helper function to create specifically an abort error
-(NSDictionary*)createAbortError:(NSString*)message
{
  return [self createMediaErrorWithCode:MEDIA_ERR_ABORTED message:message];
}

- (void)create:(CDVInvokedUrlCommand*)command
{
    NSString* mediaId = [command argumentAtIndex:0];
    NSString* resourcePath = [command argumentAtIndex:1];

    CDVAudioFile* audioFile = [self audioFileForResource:resourcePath withId:mediaId doValidation:YES forRecording:NO suppressValidationErrors:YES];

    if (audioFile == nil) {
        NSString* errorMessage = [NSString stringWithFormat:@"Failed to initialize Media file with path %@", resourcePath];
        [self onStatus:MEDIA_ERROR mediaId:mediaId param:
          [self createAbortError:errorMessage]];
    } else {
        NSURL* resourceUrl = audioFile.resourceURL;

        if (![resourceUrl isFileURL] && ![resourcePath hasPrefix:CDVFILE_PREFIX]) {
            // First create an AVPlayerItem
            audioFile.playerItem = [AVPlayerItem playerItemWithURL:resourceUrl];
            
            // Subscribe to the AVPlayerItem's PlaybackStalledNotification notification.
            [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(itemStalledPlaying:) name:AVPlayerItemPlaybackStalledNotification object:audioFile.playerItem];

            // Pass the AVPlayerItem to a new player
            //the streamPlayer will not be replaced anymore, instead a new instance will be created always
            audioFile.streamPlayer = [[AVPlayer alloc] initWithPlayerItem:audioFile.playerItem];

            // Avoid excessive buffering so streaming media can play instantly on iOS
            // Removes preplay delay on ios 10+, makes consistent with ios9 behaviour
            if ([NSProcessInfo.processInfo isOperatingSystemAtLeastVersion:(NSOperatingSystemVersion){10,0,0}]) {
                audioFile.streamPlayer.automaticallyWaitsToMinimizeStalling = NO;
            }
        }

        CDVPluginResult* result = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK];
        [self.commandDelegate sendPluginResult:result callbackId:command.callbackId];
    }
}

- (void)setVolume:(CDVInvokedUrlCommand*)command
{
    NSString* mediaId = [command argumentAtIndex:0];
    NSNumber* volume = [command argumentAtIndex:1 withDefault:[NSNumber numberWithFloat:1.0]];

    if ([self soundCache] != nil) {
        CDVAudioFile* audioFile = [[self soundCache] objectForKey:mediaId];
        if (audioFile != nil) {
            audioFile.volume = volume;
            if (audioFile.player) {
                audioFile.player.volume = [volume floatValue];
            }
            else {
                float customVolume = [volume floatValue];
                if (customVolume >= 0.0 && customVolume <= 1.0) {
                    [audioFile.streamPlayer setVolume: customVolume];
                }
                else {
                    NSLog(@"The value must be within the range of 0.0 to 1.0");
                }
            }
            [[self soundCache] setObject:audioFile forKey:mediaId];
        }
    }

    // don't care for any callbacks
}

- (void)setRate:(CDVInvokedUrlCommand*)command
{
    NSString* callbackId = command.callbackId;

#pragma unused(callbackId)
    NSString* mediaId = [command argumentAtIndex:0];
    NSNumber* rate = [command argumentAtIndex:1 withDefault:[NSNumber numberWithFloat:1.0]];

    if ([self soundCache] != nil) {
        CDVAudioFile* audioFile = [[self soundCache] objectForKey:mediaId];
        if (audioFile != nil) {
            audioFile.rate = rate;
            if (audioFile.player) {
                audioFile.player.enableRate = YES;
                audioFile.player.rate = [rate floatValue];
            }
            if (audioFile.streamPlayer.currentItem && audioFile.streamPlayer.currentItem.asset){
                float customRate = [rate floatValue];
                [audioFile.streamPlayer setRate:customRate];
            }

            [[self soundCache] setObject:audioFile forKey:mediaId];
        }
    }

    // don't care for any callbacks
}

- (void)startPlayingAudio:(CDVInvokedUrlCommand*)command
{
[self.commandDelegate runInBackground:^{
    NSString* mediaId = [command argumentAtIndex:0];
    NSString* resourcePath = [command argumentAtIndex:1];
    NSDictionary* options = [command argumentAtIndex:2 withDefault:nil];

    BOOL bError = NO;

    CDVAudioFile* audioFile = [self audioFileForResource:resourcePath withId:mediaId doValidation:YES forRecording:NO];
    if ((audioFile == nil) && (audioFile.resourceURL == nil)) return; //audioFile was nil - error already returned from audioFile for resource
    if (audioFile.player == nil) bError = [self prepareToPlay:audioFile withId:mediaId];
            
    // audioFile.player != nil  or player was successfully created
    // get the audioSession and set the category to allow Playing when device is locked or ring/silent switch engaged
    if ([self hasAudioSession]) {
        NSError* __autoreleasing err = nil;
        NSNumber* playAudioWhenScreenIsLocked = [options objectForKey:@"playAudioWhenScreenIsLocked"];
        AVAudioSessionCategory category = playAudioWhenScreenIsLocked != nil && ![playAudioWhenScreenIsLocked boolValue]
        ? AVAudioSessionCategorySoloAmbient
        : AVAudioSessionCategoryPlayback;
        
        [self.avSession setCategory:category error:&err];
        
        if (![self.avSession setActive:YES error:&err]) {
            // other audio with higher priority that does not allow mixing could cause this to fail
            NSLog(@"Unable to play audio: %@", [err localizedFailureReason]);
            bError = YES;
        }
    }

    if (bError) {
    NSLog(@"Media Error MEDIA_ERR_NONE_SUPPORTED '%@' ", mediaId);
    [self onStatus:MEDIA_ERROR mediaId:mediaId param:[self createMediaErrorWithCode:MEDIA_ERR_NONE_SUPPORTED message:nil]];
    return;
    }

    NSLog(@"Playing audio sample '%@ %@'", mediaId, audioFile.resourcePath);
    audioFile.fadeTime = [[options objectForKey:@"fadeTime"] intValue];
    double duration = 0;
    // if - case is avplayer
    if (audioFile.streamPlayer.currentItem && audioFile.streamPlayer.currentItem.asset) {
        CMTime time = audioFile.streamPlayer.currentItem.asset.duration;
        duration = CMTimeGetSeconds(time);
        if (isnan(duration)) {
            NSLog(@"Duration is infifnite, setting it to -1");
            duration = -1;
        }

        if (audioFile.rate != nil){
            float customRate = [audioFile.rate floatValue];
            NSLog(@"Playing stream with AVPlayer & custom rate");
            [audioFile.streamPlayer setRate:customRate];
        } else {
            NSLog(@"Playing stream with AVPlayer & default rate");
            [audioFile.streamPlayer play];
        }
    // else - case is player
    } else {

        NSNumber* loopOption = [options objectForKey:@"numberOfLoops"];
        NSInteger numberOfLoops = 0;
        if (loopOption != nil) {
            numberOfLoops = [loopOption intValue] - 1;
        }
        audioFile.player.numberOfLoops = numberOfLoops;
        if (audioFile.player.isPlaying) {
            [audioFile.player stop];
            audioFile.player.currentTime = 0;
        }
        if (audioFile.volume != nil) {
            audioFile.player.volume = [audioFile.volume floatValue];
        }

        audioFile.player.enableRate = YES;
        if (audioFile.rate != nil) {
            audioFile.player.rate = [audioFile.rate floatValue];
        }

        [audioFile.player play];
        duration = round(audioFile.player.duration * 1000) / 1000;
    }
    
    id __block token = [[NSNotificationCenter defaultCenter] addObserverForName:AVPlayerItemDidPlayToEndTimeNotification object:audioFile.playerItem queue:[NSOperationQueue mainQueue] usingBlock:^(NSNotification *note) {
                        NSLog(@"AUDIO PLAYER DID FINISH PLAYING. Media State ENDED '%@' ", mediaId);
                        [self onStatus:MEDIA_STATE mediaId:mediaId param:@(MEDIA_ENDED)];
                        [[NSNotificationCenter defaultCenter] removeObserver:mediaId];
                        [[NSNotificationCenter defaultCenter] removeObserver:token];
                        if (audioFile.player != nil) [audioFile.player stop];
                        if (audioFile.streamPlayer.currentItem) {
                            [audioFile.streamPlayer pause];
                            audioFile.streamPlayer = nil;
                        }
                        if (! [self isPlayingOrRecording]) [self.avSession setActive:NO error:nil];
                    }];

    [self onStatus:MEDIA_DURATION mediaId:mediaId param:@(duration)];
    [self onStatus:MEDIA_STATE mediaId:mediaId param:@(MEDIA_RUNNING)];
    NSLog(@"Media State RUNNING '%@' ", mediaId);
}];
}

- (BOOL)prepareToPlay:(CDVAudioFile*)audioFile withId:(NSString*)mediaId
{
    BOOL bError = NO;
    NSError* __autoreleasing playerError = nil;

    // create the player
    NSURL* resourceURL = audioFile.resourceURL;

    if ([resourceURL isFileURL]) {
        audioFile.player = [[CDVAudioPlayer alloc] initWithContentsOfURL:resourceURL error:&playerError];
    }

    if (playerError != nil) {
        NSLog(@"Failed to initialize AVAudioPlayer: %@\n", [playerError localizedDescription]);
        audioFile.player = nil;
        if (! [self isPlayingOrRecording]) {
            [self.avSession setActive:NO error:nil];
        }
        bError = YES;
    } else {
        audioFile.player.mediaId = mediaId;
        audioFile.player.delegate = self;
        if (audioFile.streamPlayer == nil)
            bError = ![audioFile.player prepareToPlay];
    }
    return bError;
}

- (void)stopPlayingAudio:(CDVInvokedUrlCommand*)command
{
    NSString* mediaId = [command argumentAtIndex:0];
    CDVAudioFile* audioFile = [[self soundCache] objectForKey:mediaId];
    
    if (audioFile != nil) {
        [audioFile.player stop];
        audioFile.player.currentTime = 0;
        [audioFile.streamPlayer pause];
        audioFile.streamPlayer = nil;
        [self onStatus:MEDIA_STATE mediaId:mediaId param:@(MEDIA_STOPPED)];
        NSLog(@"Stopped playing audio. Media State STOPPED '%@ %@'", mediaId, audioFile.resourcePath);
    }
}

- (void)pausePlayingAudio:(CDVInvokedUrlCommand*)command
{
    NSString* mediaId = [command argumentAtIndex:0];
    CDVAudioFile* audioFile = [[self soundCache] objectForKey:mediaId];

    if (audioFile != nil) {
        if (audioFile.player != nil) {
            [audioFile.player pause];
        } else if (audioFile.streamPlayer != nil) {
            [audioFile.streamPlayer pause];
        }
        [self onStatus:MEDIA_STATE mediaId:mediaId param:@(MEDIA_PAUSED)];
        NSLog(@"Stopped playing audio. Media State PAUSED '%@ %@'", mediaId, audioFile.resourcePath);
    }
}

- (void)seekToAudio:(CDVInvokedUrlCommand*)command
{
    // args:
    // 0 = Media id
    // 1 = seek to location in milliseconds

    NSString* mediaId = [command argumentAtIndex:0];

    CDVAudioFile* audioFile = [[self soundCache] objectForKey:mediaId];
    double position = [[command argumentAtIndex:1] doubleValue];
    double posInSeconds = position / 1000;

    if ((audioFile != nil) && (audioFile.player != nil)) {

        if (posInSeconds >= audioFile.player.duration) {
            // The seek is past the end of file.  Stop media and reset to beginning instead of seeking past the end.
            [audioFile.player stop];
            audioFile.player.currentTime = 0;
            [self onStatus:MEDIA_STATE mediaId:mediaId param:@(MEDIA_STOPPED)];
            NSLog(@"Seeking... Media State STOPPED '%@' ", mediaId);
        } else {
            audioFile.player.currentTime = posInSeconds;
            [self onStatus:MEDIA_POSITION mediaId:mediaId param:@(posInSeconds)];
        }

    } else if (audioFile.streamPlayer != nil) {
        int32_t timeScale = audioFile.streamPlayer.currentItem.asset.duration.timescale;
        CMTime timeToSeek = CMTimeMakeWithSeconds(posInSeconds, timeScale);

        BOOL isPlaying = audioFile.streamPlayer.rate > 0 && !audioFile.streamPlayer.error;
        BOOL isReadyToSeek = (audioFile.streamPlayer.status == AVPlayerStatusReadyToPlay) && (audioFile.streamPlayer.currentItem.status == AVPlayerItemStatusReadyToPlay);

        // CB-10535:
        // When dealing with remote files, we can get into a situation where we start playing before AVPlayer has had the time to buffer the file to be played.
        // To avoid the app crashing in such a situation, we only seek if both the player and the player item are ready to play. If not ready, we send an error back to JS land.
        if(isReadyToSeek) {
            [audioFile.streamPlayer seekToTime: timeToSeek
                 toleranceBefore: kCMTimeZero
                  toleranceAfter: kCMTimeZero
               completionHandler: ^(BOOL finished) {
                   if (isPlaying) [audioFile.streamPlayer play];
               }];
        } else {
            NSString* errMsg = @"AVPlayerItem cannot service a seek request with a completion handler until its status is AVPlayerItemStatusReadyToPlay.";
            [self onStatus:MEDIA_ERROR mediaId:mediaId param:
              [self createAbortError:errMsg]];
        }
    }
}


- (void)release:(CDVInvokedUrlCommand*)command
{
    NSString* mediaId = [command argumentAtIndex:0];

    if (mediaId != nil) {
        CDVAudioFile* audioFile = [[self soundCache] objectForKey:mediaId];

        if (audioFile != nil) {
            if (audioFile.player && [audioFile.player isPlaying]) {
                [audioFile.player stop];
            }
            if (audioFile.recorder && [audioFile.recorder isRecording]) {
                [audioFile.recorder stop];
            }
            if (audioFile.streamPlayer != nil) {
                [audioFile.streamPlayer pause];
                audioFile.streamPlayer = nil;
            }
            
            if (! [self isPlayingOrRecording]) {
                [self.avSession setActive:NO error:nil];
                self.avSession = nil;
            }
            [[self soundCache] removeObjectForKey:mediaId];
            NSLog(@"Media with id %@ released", mediaId);
        }
    }
}

- (void)getCurrentPositionAudio:(CDVInvokedUrlCommand*)command
{
    NSString* callbackId = command.callbackId;
    NSString* mediaId = [command argumentAtIndex:0];
    CDVAudioFile* audioFile = [[self soundCache] objectForKey:mediaId];
    double position = -1;

    if ([audioFile.player isPlaying]) {
        position = round(audioFile.player.currentTime * 1000) / 1000;
    }
     if (audioFile.streamPlayer) {
       CMTime time = [audioFile.streamPlayer currentTime];
       position = CMTimeGetSeconds(time);
    }

    CDVPluginResult* result = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDouble:position];

    [self onStatus:MEDIA_POSITION mediaId:mediaId param:@(position)];
    [self.commandDelegate sendPluginResult:result callbackId:callbackId];
}

- (void)startRecordingAudio:(CDVInvokedUrlCommand*)command
{
    NSString* callbackId = command.callbackId;

#pragma unused(callbackId)

    NSString* mediaId = [command argumentAtIndex:0];
    CDVAudioFile* audioFile = [self audioFileForResource:[command argumentAtIndex:1] withId:mediaId doValidation:YES forRecording:YES];
    __block NSString* errorMsg = @"";

    if ((audioFile != nil) && (audioFile.resourceURL != nil)) {

        __weak CDVSound* weakSelf = self;

        void (^startRecording)(void) = ^{
            NSError* __autoreleasing error = nil;

            if (audioFile.recorder != nil) {
                [audioFile.recorder stop];
                audioFile.recorder = nil;
            }
            // get the audioSession and set the category to allow recording when device is locked or ring/silent switch engaged
            if ([weakSelf hasAudioSession]) {
                if (![weakSelf.avSession.category isEqualToString:AVAudioSessionCategoryPlayAndRecord]) {
                    [weakSelf.avSession setCategory:AVAudioSessionCategoryRecord error:nil];
                }

                if (![weakSelf.avSession setActive:YES error:&error]) {
                    // other audio with higher priority that does not allow mixing could cause this to fail
                    errorMsg = [NSString stringWithFormat:@"Unable to record audio: %@", [error localizedFailureReason]];
                    [weakSelf onStatus:MEDIA_ERROR mediaId:mediaId param:
                           [self createAbortError:errorMsg]];
                    return;
                }
            }

            // create a new recorder for each start record
            bool isWav=[[audioFile.resourcePath pathExtension] isEqualToString:@"wav"];
            NSMutableDictionary *audioSettings = [NSMutableDictionary dictionaryWithDictionary:
                                            @{AVSampleRateKey: @(44100),
                                             AVNumberOfChannelsKey: @(1),
                                             }];
            if (isWav)  {
                audioSettings[AVFormatIDKey]=@(kAudioFormatLinearPCM);
                audioSettings[AVLinearPCMBitDepthKey]=@(16);
                audioSettings[AVLinearPCMIsBigEndianKey]=@(false);
                audioSettings[AVLinearPCMIsFloatKey]=@(false);
            } else {
                audioSettings[AVFormatIDKey]=@(kAudioFormatMPEG4AAC);
                audioSettings[AVEncoderAudioQualityKey]=@(AVAudioQualityMedium);
            }
            audioFile.recorder = [[CDVAudioRecorder alloc] initWithURL:audioFile.resourceURL settings:audioSettings error:&error];

            bool recordingSuccess = NO;
            if (error == nil) {
                audioFile.recorder.delegate = weakSelf;
                audioFile.recorder.mediaId = mediaId;
                audioFile.recorder.meteringEnabled = YES;
                recordingSuccess = [audioFile.recorder record];
                if (recordingSuccess) {
                    NSLog(@"Started recording audio sample '%@ %@'", mediaId, audioFile.resourcePath);
                    [weakSelf onStatus:MEDIA_STATE mediaId:mediaId param:@(MEDIA_RUNNING)];
                }
            }

            if ((error != nil) || (recordingSuccess == NO)) {
                if (error != nil) {
                    errorMsg = [NSString stringWithFormat:@"Failed to initialize AVAudioRecorder: %@\n", [error localizedFailureReason]];
                } else {
                    errorMsg = @"Failed to start recording using AVAudioRecorder";
                }
                audioFile.recorder = nil;
                if (! keepAvAudioSessionAlwaysActive && weakSelf.avSession && ! [self isPlayingOrRecording]) {
                    [weakSelf.avSession setActive:NO error:nil];
                }
                [weakSelf onStatus:MEDIA_ERROR mediaId:mediaId param:
                           [self createAbortError:errorMsg]];
            }
        };

        SEL rrpSel = NSSelectorFromString(@"requestRecordPermission:");
        if ([self hasAudioSession] && [self.avSession respondsToSelector:rrpSel])
        {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
            [self.avSession performSelector:rrpSel withObject:^(BOOL granted){
                if (granted) {
                    startRecording();
                } else {
                    NSString* msg = @"Error creating audio session, microphone permission denied.";
                    NSLog(@"%@", msg);
                    audioFile.recorder = nil;
                    if (! keepAvAudioSessionAlwaysActive && weakSelf.avSession && ! [self isPlayingOrRecording]) {
                        [weakSelf.avSession setActive:NO error:nil];
                    }
                    [weakSelf onStatus:MEDIA_ERROR mediaId:mediaId param:
                           [self createAbortError:msg]];
                }
            }];
#pragma clang diagnostic pop
        } else {
            startRecording();
        }

    } else {
        // file did not validate
        NSString* errorMsg = [NSString stringWithFormat:@"Could not record audio at '%@ %@'", mediaId, audioFile.resourcePath];
        [self onStatus:MEDIA_ERROR mediaId:mediaId param:
          [self createAbortError:errorMsg]];
    }
}

- (void)stopRecordingAudio:(CDVInvokedUrlCommand*)command
{
    NSString* mediaId = [command argumentAtIndex:0];

    CDVAudioFile* audioFile = [[self soundCache] objectForKey:mediaId];

    if ((audioFile != nil) && (audioFile.recorder != nil)) {
        NSLog(@"Stopped recording audio sample '%@ %@'", mediaId, audioFile.resourcePath);
        [audioFile.recorder stop];
        // no callback - that will happen in audioRecorderDidFinishRecording
    }
}

- (void)audioRecorderDidFinishRecording:(AVAudioRecorder*)recorder successfully:(BOOL)flag
{
    CDVAudioRecorder* aRecorder = (CDVAudioRecorder*)recorder;
    NSString* mediaId = aRecorder.mediaId;
    CDVAudioFile* audioFile = [[self soundCache] objectForKey:mediaId];

    if (audioFile != nil) {
        NSLog(@"Finished recording audio sample '%@ %@'", mediaId, audioFile.resourcePath);
    }
    if (flag) {
        [self onStatus:MEDIA_STATE mediaId:mediaId param:@(MEDIA_STOPPED)];
    } else {
        [self onStatus:MEDIA_ERROR mediaId:mediaId param:
          [self createMediaErrorWithCode:MEDIA_ERR_DECODE message:nil]];
    }
    if (! keepAvAudioSessionAlwaysActive && self.avSession && ! [self isPlayingOrRecording]) {
        [self.avSession setActive:NO error:nil];
    }
}

-(void)itemStalledPlaying:(NSNotification *) notification {
    // Will be called when playback stalls due to buffer empty
    NSLog(@"Stalled playback");
}

- (void)onMemoryWarning
{
    /* https://issues.apache.org/jira/browse/CB-11513 */
    NSMutableArray* keysToRemove = [[NSMutableArray alloc] init];
    
    for(id key in [self soundCache]) {
        CDVAudioFile* audioFile = [[self soundCache] objectForKey:key];
        if (audioFile != nil) {
            if (audioFile.player != nil && ![audioFile.player isPlaying]) {
                [keysToRemove addObject:key];
            }
            if (audioFile.recorder != nil && ![audioFile.recorder isRecording]) {
                [keysToRemove addObject:key];
            }
        }
    }
    
    [[self soundCache] removeObjectsForKeys:keysToRemove];
    
    // [[self soundCache] removeAllObjects];
    // [self setSoundCache:nil];
    [self setAvSession:nil];

    [super onMemoryWarning];
}


- (void)dealloc
{
    [[self soundCache] removeAllObjects];
}

- (void)onReset
{
    for (CDVAudioFile* audioFile in [[self soundCache] allValues]) {
        if (audioFile != nil) {
            if (audioFile.player != nil) {
                [audioFile.player stop];
                audioFile.player.currentTime = 0;
            }
            if (audioFile.recorder != nil) {
                [audioFile.recorder stop];
            }
        }
    }

    [[self soundCache] removeAllObjects];
}

- (void)getCurrentAmplitudeAudio:(CDVInvokedUrlCommand*)command
{
    NSString* callbackId = command.callbackId;
    NSString* mediaId = [command argumentAtIndex:0];

#pragma unused(mediaId)
    CDVAudioFile* audioFile = [[self soundCache] objectForKey:mediaId];
    float amplitude = 0; // The linear 0.0 .. 1.0 value

    if ((audioFile != nil) && (audioFile.recorder != nil) && [audioFile.recorder isRecording]) {
        [audioFile.recorder updateMeters];
        float minDecibels = -60.0f; // Or use -60dB, which I measured in a silent room.
        float decibels    = [audioFile.recorder averagePowerForChannel:0];
        if (decibels < minDecibels) {
            amplitude = 0.0f;
        } else if (decibels >= 0.0f) {
            amplitude = 1.0f;
        } else {
            float root            = 2.0f;
            float minAmp          = powf(10.0f, 0.05f * minDecibels);
            float inverseAmpRange = 1.0f / (1.0f - minAmp);
            float amp             = powf(10.0f, 0.05f * decibels);
            float adjAmp          = (amp - minAmp) * inverseAmpRange;
            amplitude = powf(adjAmp, 1.0f / root);
        }
    }
    CDVPluginResult* result = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDouble:amplitude];
    [self.commandDelegate sendPluginResult:result callbackId:callbackId];
 }

 - (void)resumeRecordingAudio:(CDVInvokedUrlCommand*)command
  {
     NSString* mediaId = [command argumentAtIndex:0];

     CDVAudioFile* audioFile = [[self soundCache] objectForKey:mediaId];

     if ((audioFile != nil) && (audioFile.recorder != nil)) {
         NSLog(@"Resumed recording audio sample '%@ %@'", mediaId, audioFile.resourcePath);
         [audioFile.recorder record];
         // no callback - that will happen in audioRecorderDidFinishRecording
         [self onStatus:MEDIA_STATE mediaId:mediaId param:@(MEDIA_RUNNING)];
     }

}

 - (void)pauseRecordingAudio:(CDVInvokedUrlCommand*)command
  {
     NSString* mediaId = [command argumentAtIndex:0];

     CDVAudioFile* audioFile = [[self soundCache] objectForKey:mediaId];

     if ((audioFile != nil) && (audioFile.recorder != nil)) {
         NSLog(@"Paused recording audio sample '%@ %@'", mediaId, audioFile.resourcePath);
         [audioFile.recorder pause];
         // no callback - that will happen in audioRecorderDidFinishRecording
         [self onStatus:MEDIA_STATE mediaId:mediaId param:@(MEDIA_PAUSED)];
     }
 }

- (void)messageChannel:(CDVInvokedUrlCommand*)command
{
    self.statusCallbackId = command.callbackId;
}

- (void)onStatus:(CDVMediaMsg)what mediaId:(NSString*)mediaId param:(NSObject*)param
{
    if (self.statusCallbackId!=nil) { //new way, android,windows compatible
        NSMutableDictionary* status=[NSMutableDictionary dictionary];
        status[@"msgType"] = @(what);
        //in the error case contains a dict with "code" and "message"
        //otherwise a NSNumber
        status[@"value"] = param;
        status[@"id"] = mediaId;
        NSMutableDictionary* dict=[NSMutableDictionary dictionary];
        dict[@"action"] = @"status";
        dict[@"status"] = status;
        CDVPluginResult* result = [CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDictionary:dict];
        [result setKeepCallbackAsBool:YES]; //we keep this forever
        [self.commandDelegate sendPluginResult:result callbackId:self.statusCallbackId];
    } else { //old school evalJs way
        if (what==MEDIA_ERROR) {
            NSData* jsonData = [NSJSONSerialization dataWithJSONObject:param options:0 error:nil];
            param=[[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        }
        NSString* jsString = [NSString stringWithFormat:@"%@(\"%@\",%d,%@);",
              @"cordova.require('cordova-plugin-media.Media').onStatus",
              mediaId, (int)what, param];
        [self.commandDelegate evalJs:jsString];
    }
}

//method highly used to validate if there is anything running
-(BOOL) isPlayingOrRecording
{
    if (keepAvAudioSessionAlwaysActive) return true;
    if (!self.avSession) return false;
    for(NSString* mediaId in soundCache) {
        CDVAudioFile* audioFile = [soundCache objectForKey:mediaId];
        if ([audioFile.player isPlaying]) return true;
        if (audioFile.streamPlayer.rate > 0 && !audioFile.streamPlayer.error) return true;
        if (audioFile.recorder && [audioFile.recorder isRecording]) return true;
    }
    return false;
}

@end

@implementation CDVAudioFile

@synthesize resourcePath;
@synthesize resourceURL;
@synthesize player, volume, rate, fadeTime, streamPlayer, playerItem;
@synthesize recorder;

@end
@implementation CDVAudioPlayer
@synthesize mediaId;

@end

@implementation CDVAudioRecorder
@synthesize mediaId;

@end
