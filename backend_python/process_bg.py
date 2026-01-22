import os
from rembg import remove
from PIL import Image

# Exact absolute paths to avoid confusion
INPUT_PATH = r"C:/Users/User01/.gemini/antigravity/brain/9b67df8c-2099-475f-aeb5-b9fad8b203eb/uploaded_image_1769023353679.png"
OUTPUT_PATH = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_avatar_v2.png"

def run():
    print(f"🖼️  Processing image...")
    print(f"   Input: {INPUT_PATH}")
    print(f"   Output: {OUTPUT_PATH}")

    if not os.path.exists(INPUT_PATH):
        print("❌ Error: Input file does not exist")
        return

    try:
        # Open source
        with open(INPUT_PATH, 'rb') as i:
            input_data = i.read()
            
        # Process
        output_data = remove(input_data)
        
        # Ensure output directory exists (redundant check)
        os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
        
        # Save result
        with open(OUTPUT_PATH, 'wb') as o:
            o.write(output_data)
            
        print("✅ Success! Background removed.")
        
    except Exception as e:
        print(f"❌ Error processing image: {e}")
        raise e

if __name__ == "__main__":
    run()
