import sys
import asyncio
import edge_tts
import os

async def main():
    if len(sys.argv) < 3:
        print("Usage: python scripts/tts_stream.py <text> <out_path>")
        return

    text = sys.argv[1]
    out_path = sys.argv[2]

    voice = "en-IN-NeerjaNeural" 
    
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(out_path)

if __name__ == "__main__":
    asyncio.run(main())
