"""Read bounded generated PNGs from instrumentation, without run-as privileges."""
import base64
import re

def extract_screenshots(report,names):
    images={}
    for name in names:
        matches=re.findall(r'^INSTRUMENTATION_RESULT: '+re.escape(name)+r'=(.*)$',report,re.M)
        if len(matches)!=1 or len(matches[0])>700000:
            raise ValueError('Missing, duplicate or oversized screenshot: '+name)
        data=base64.b64decode(matches[0].strip(),validate=True)
        if not data.startswith(b'\x89PNG\r\n\x1a\n') or len(data)>=512000:
            raise ValueError('Invalid or oversized PNG: '+name)
        images[name]=data
    return images
