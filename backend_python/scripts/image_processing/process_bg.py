from rembg import remove
from PIL import Image
import os

def process_image(input_path, output_path):
    print(f"Processing: {input_path}")
    
    try:
        input_image = Image.open(input_path)
        
        # Remove background using U-2-Net (default in rembg)
        output_image = remove(input_image)
        
        output_image.save(output_path)
        print(f"Success! Saved to: {output_path}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Original uploaded image
    input_file = r"C:\Users\User01\.gemini\antigravity\brain\42553532-c9fb-4974-b1fb-6ffba470f0bf\uploaded_image_1769122849432.png"
    # Target asset path
    output_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_final_v6.png"
    
    process_image(input_file, output_file)
