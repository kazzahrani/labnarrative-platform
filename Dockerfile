FROM ghcr.io/harry0703/moneyprinterturbo:latest

WORKDIR /MoneyPrinterTurbo

# Railway Hobby gives this renderer 1 GB RAM. Keep the public 9:16 contract,
# but render the intermediate/final portrait canvas at 720x1280 so MoviePy +
# FFmpeg stay comfortably below the memory ceiling.
RUN python3 - <<'PY'
from pathlib import Path
p = Path("/MoneyPrinterTurbo/app/models/schema.py")
s = p.read_text()
old = """        elif self == VideoAspect.portrait:
            return 1080, 1920"""
new = """        elif self == VideoAspect.portrait:
            return 720, 1280"""
if old not in s:
    raise SystemExit("portrait resolution anchor not found")
p.write_text(s.replace(old, new, 1))
PY

RUN mkdir -p /MoneyPrinterTurbo/storage/local_videos \
 && ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "color=c=0x0b1016:s=720x1280:d=12:r=30" \
    -vf "drawgrid=w=80:h=80:t=2:c=0x111923,drawbox=x=0:y=0:w=720:h=12:color=0xd6e2d2:t=fill,drawbox=x=55:y=90:w=152:h=10:color=0x7f9c83:t=fill" \
    -c:v libx264 -preset veryfast -pix_fmt yuv420p \
    /MoneyPrinterTurbo/storage/local_videos/labnarrative-studio.mp4

EXPOSE 8501

ENTRYPOINT []

CMD ["python3","-c","import os,uvicorn; from app.config import config; config.app['api_key']=os.environ['MPT_API_KEY']; config.app['video_codec']='libx264'; uvicorn.run('app.asgi:app',host='0.0.0.0',port=8501,log_level='warning')"]
