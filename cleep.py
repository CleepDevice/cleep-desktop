import subprocess
import os
import signal
import time

rpc = subprocess.Popen(['python3', 'rpcserver.py'])
ui = subprocess.Popen(['python3', 'ui.py'])

#handle user kill
try:
    while True:
        time.sleep(0.5)
except:
    if ui:
        os.kill(ui.pid, signal.SIGTERM)
    if rpc:
        os.kill(rpc.pid, signal.SIGTERM)

