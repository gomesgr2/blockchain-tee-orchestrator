import sys
import os

print("sys.path:", sys.path)
print("CWD:", os.getcwd())
try:
    print("os.listdir('/app'):", os.listdir('/app'))
except Exception as e:
    print(e)
try:
    print("os.listdir('/app/src'):", os.listdir('/app/src'))
except Exception as e:
    print(e)
