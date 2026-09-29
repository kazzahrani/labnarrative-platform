FROM ghcr.io/harry0703/moneyprinterturbo:latest

WORKDIR /MoneyPrinterTurbo

RUN mkdir -p /MoneyPrinterTurbo/storage/local_videos \
 && python3 -c "from PIL import Image,ImageDraw; p='/MoneyPrinterTurbo/storage/local_videos/labnarrative-studio.png'; im=Image.new('RGB',(1080,1920),(11,16,22)); d=ImageDraw.Draw(im); [d.line((0,y,1080,y),fill=(17,25,35),width=2) for y in range(0,1920,120)]; [d.line((x,0,x,1920),fill=(17,25,35),width=2) for x in range(0,1080,120)]; d.rectangle((0,0,1080,18),fill=(214,226,210)); d.rectangle((82,135,310,150),fill=(127,156,131)); im.save(p)"

EXPOSE 8501

ENTRYPOINT []

CMD ["python3","-c","import os,uvicorn; from app.config import config; config.app['api_key']=os.environ['MPT_API_KEY']; uvicorn.run('app.asgi:app',host='0.0.0.0',port=8501,log_level='warning')"]
