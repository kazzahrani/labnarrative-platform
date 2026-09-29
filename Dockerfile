FROM ghcr.io/harry0703/moneyprinterturbo:latest

WORKDIR /MoneyPrinterTurbo

RUN mkdir -p /MoneyPrinterTurbo/storage/local_videos \
 && ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "color=c=0x0b1016:s=1080x1920:d=12:r=30" \
    -vf "drawgrid=w=120:h=120:t=2:c=0x111923,drawbox=x=0:y=0:w=1080:h=18:color=0xd6e2d2:t=fill,drawbox=x=82:y=135:w=228:h=15:color=0x7f9c83:t=fill" \
    -c:v libx264 -preset veryfast -pix_fmt yuv420p \
    /MoneyPrinterTurbo/storage/local_videos/labnarrative-studio.mp4

EXPOSE 8501

ENTRYPOINT []

CMD ["python3","-c","import os,uvicorn; from app.config import config; config.app['api_key']=os.environ['MPT_API_KEY']; uvicorn.run('app.asgi:app',host='0.0.0.0',port=8501,log_level='warning')"]
