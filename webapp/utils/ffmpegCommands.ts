import { VideoFormats, VideoInputSettings } from "~/types";
import { getFileExtension } from "./convert";

export const twitterCompressionCommand = (input: string, output: string) => [
  "-i",
  input,
  "-c:v",
  "libx264",
  "-profile:v",
  "high",
  "-level:v",
  "4.2",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-movflags",
  "faststart",
  "-r",
  "30",
  "-maxrate",
  "5000k",
  "-bufsize",
  "5000k",
  "-tune",
  "film",
  output,
];

export const customVideoCompressionCommand = (
  input: string,
  output: string,
  videoSettings: VideoInputSettings
): string[] => {
  const inputType = getFileExtension(input);
  if (inputType === "mp4" && videoSettings.videoType === VideoFormats.MP4) {
    return getMp4ToMp4Command(input, output, videoSettings);
  } else {
    switch (videoSettings.videoType) {
      case VideoFormats.MP4:
        return getMp4Command(input, output, videoSettings);
      case VideoFormats.WEBM:
        return getWebMCommand(input, output, videoSettings);
      case VideoFormats.AVI:
        return getAVICommand(input, output, videoSettings);
      case VideoFormats.FLV:
        return getFLVCommand(input, output, videoSettings);
      case VideoFormats.MKV:
        return getMKVCommand(input, output, videoSettings);
      case VideoFormats.MOV:
        return getMOVCommand(input, output, videoSettings);
      default:
        return ["-i", input, output];
    }
  }
};

const getMp4ToMp4Command = (
  input: string,
  output: string,
  videoSettings: VideoInputSettings
) => {
  const ffmpegCommand = [
    "-i",
    input,
    "-c:v",
    "libx264",
    "-crf",
    "23",
    "-preset",
    "medium",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    output,
  ];
  return ffmpegCommand;
};

const getWebMCommand = (
  input: string,
  output: string,
  videoSettings: VideoInputSettings
): string[] => {
  const audioOptions = videoSettings.removeAudio ? [] : ["-c:a", "libvorbis"];
  const trimFilter = `trim=start=${videoSettings.customStartTime}:end=${videoSettings.customEndTime}`;

  if (videoSettings.keepAlpha) {
    // VP9 + yuva420p preserves per-pixel transparency (e.g. from a PNG-sequence
    // or ProRes 4444 source); -auto-alt-ref 0 is required or libvpx-vp9's
    // alt-ref frames corrupt the alpha side channel. This exact recipe is
    // verified working end-to-end against native ffmpeg (see tools/ffmpeg);
    // the bundled single-threaded ffmpeg.wasm core currently crashes
    // ("memory access out of bounds") on this codec path - see
    // CLAUDE_CONTEXT.md "Known issues".
    return [
      "-i",
      input,
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuva420p",
      "-auto-alt-ref",
      "0",
      "-crf",
      videoSettings.quality,
      "-b:v",
      "0",
      ...audioOptions,
      "-vf",
      trimFilter,
      output,
    ];
  }

  return [
    "-i",
    input,
    "-c:v",
    "libvpx",
    "-crf",
    videoSettings.quality,
    "-b:v",
    "1M",
    ...audioOptions,
    "-vf",
    trimFilter,
    output,
  ];
};

const getMKVCommand = (
  input: string,
  output: string,
  videoSettings: VideoInputSettings
): string[] => {
  const audioOptions = videoSettings.removeAudio ? [] : ["-c:a", "aac"];
  return [
    "-i",
    input,
    "-c:v",
    "libx264",
    "-crf",
    videoSettings.quality,
    ...audioOptions,
    "-vf",
    `trim=start=${videoSettings.customStartTime}:end=${videoSettings.customEndTime}`,
    output,
  ];
};

const getAVICommand = (
  input: string,
  output: string,
  videoSettings: VideoInputSettings
): string[] => {
  const audioOptions = videoSettings.removeAudio ? [] : ["-c:a", "mp3"];
  return [
    "-i",
    input,
    "-c:v",
    "libx264",
    "-crf",
    videoSettings.quality,
    ...audioOptions,
    "-vf",
    `trim=start=${videoSettings.customStartTime}:end=${videoSettings.customEndTime}`,
    output,
  ];
};

const getFLVCommand = (
  input: string,
  output: string,
  videoSettings: VideoInputSettings
): string[] => {
  const audioOptions = videoSettings.removeAudio ? [] : ["-c:a", "aac"];
  return [
    "-i",
    input,
    "-c:v",
    "libx264",
    "-crf",
    videoSettings.quality,
    ...audioOptions,
    "-vf",
    `trim=start=${videoSettings.customStartTime}:end=${videoSettings.customEndTime}`,
    output,
  ];
};

const getMOVCommand = (
  input: string,
  output: string,
  videoSettings: VideoInputSettings
): string[] => {
  const audioOptions = videoSettings.removeAudio ? [] : ["-c:a", "aac"];
  return [
    "-i",
    input,
    "-c:v",
    "libx264",
    "-crf",
    videoSettings.quality,
    ...audioOptions,
    "-vf",
    `trim=start=${videoSettings.customStartTime}:end=${videoSettings.customEndTime}`,
    output,
  ];
};

const getMp4Command = (
  input: string,
  output: string,
  videoSettings: VideoInputSettings
) => {
  const ffmpegCommand = [
    "-i",
    input,
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-level:v",
    "4.2",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-maxrate",
    "5000k",
    "-bufsize",
    "5000k",
    "-tune",
    "film",
    "-ss",
    videoSettings.customStartTime.toString(),
    "-to",
    videoSettings.customEndTime.toString(),
    "-q:v",
    videoSettings.quality,
    "-c:v",
    "libx264",
    "-crf",
    "18",
    "-preset",
    "medium",
    "-f",
    videoSettings.videoType,
  ];

  if (!videoSettings.removeAudio) {
    ffmpegCommand.push("-c:a", "aac", "-b:a", "192k", "-movflags", "faststart");
  } else {
    ffmpegCommand.push("-an");
  }
  ffmpegCommand.push(output);
  return ffmpegCommand;
};
