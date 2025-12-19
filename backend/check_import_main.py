import sys
import traceback
sys.path.insert(0, '.')
try:
    import main
    print('main imported')
except Exception:
    traceback.print_exc()
