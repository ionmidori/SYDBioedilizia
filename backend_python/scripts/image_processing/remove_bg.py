from PIL import Image
import sys
import os

def remove_background(input_path, output_path):
    print(f"Processing {input_path}...")
    try:
        img = Image.open(input_path).convert("RGBA")
        datas = img.getdata()

        newData = []
        # Background color to remove (White or Gray-ish checkerboard)
        # We will assume the corner pixel is the background
        bg_color = img.getpixel((0, 0))
        print(f"Detected background color at (0,0): {bg_color}")
        
        tolerance = 30 

        for item in datas:
            # Check if pixel is within tolerance of background color
            if (abs(item[0] - bg_color[0]) < tolerance and
                abs(item[1] - bg_color[1]) < tolerance and
                abs(item[2] - bg_color[2]) < tolerance):
                newData.append((255, 255, 255, 0)) # Fully transparent
            else:
                newData.append(item)

        img.putdata(newData)
        img.save(output_path, "PNG")
        print(f"Saved transparent image to {output_path}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Input: Original high-res uploaded image (white background)
    # Be careful to use the correct original file path
    input_file = r"C:\Users\User01\.gemini\antigravity\brain\42553532-c9fb-4974-b1fb-6ffba470f0bf\uploaded_image_1769122849432.png"
    output_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_luxury.png"
    
    remove_background(input_file, output_file)
