$ffmpeg = 'C:\Users\mwali\.gemini\antigravity\scratch\AnF\windows\media\ffmpeg.exe'
$video = 'C:\Users\mwali\.gemini\antigravity\brain\f10fdf1b-1af0-4384-8fb1-df4a9bfd6e07\.user_uploaded\media_1793477102556_418799a1.mp4'
$outDir = 'C:\Users\mwali\.gemini\antigravity\brain\f10fdf1b-1af0-4384-8fb1-df4a9bfd6e07\user_video_frames'
New-Item -ItemType Directory -Force $outDir | Out-Null
& $ffmpeg -i $video -vf "fps=1/2.5,scale=720:1280" "$outDir\frame_%03d.png" -y
& $ffmpeg -i $video -vn -acodec libmp3lame -q:a 4 "$outDir\audio.mp3" -y
Get-ChildItem -Path $outDir | Select-Object Name, Length
