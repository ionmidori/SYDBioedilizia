from PIL import Image, ImageDraw, ImageChops
import math

def magic_wand_remove(input_path, output_path):
    print(f"Processing {input_path}...")
    try:
        img = Image.open(input_path).convert("RGBA")
        width, height = img.size
        
        # Pass 1: Aggressive Flood Fill from corners
        # This removes the main white background
        ImageDraw.floodfill(img, xy=(0, 0), value=(0, 0, 0, 0), thresh=50)
        ImageDraw.floodfill(img, xy=(width-1, 0), value=(0, 0, 0, 0), thresh=50)
        ImageDraw.floodfill(img, xy=(0, height-1), value=(0, 0, 0, 0), thresh=50)
        ImageDraw.floodfill(img, xy=(width-1, height-1), value=(0, 0, 0, 0), thresh=50)
        
        # Pass 2: Scrubber for the floor
        # The user complains about floor artifacts.
        # We will iterate the bottom 15% pixels. 
        # If a pixel is NOT transparent, but is VERY light (gray shadow), we nuke it.
        
        pixels = img.load()
        scan_start_y = int(height * 0.85)
        
        for y in range(scan_start_y, height):
            for x in range(width):
                r, g, b, a = pixels[x, y]
                
                if a == 0: continue # Already clear
                
                # Check brightness
                brightness = (r + g + b) // 3
                
                # If it's a light shadow (grayish), remove it
                # The robot feet are "Luxury Teal" and "Gold".
                # Gold is approx (233, 196, 106) -> Brightness ~178
                # Teal is approx (42, 157, 143) -> Brightness ~114
                # Dark blue body is ~50
                
                # Floor shadow is usually > 200 brightness (light gray on white)
                if brightness > 210:
                    pixels[x, y] = (r, g, b, 0)
                elif brightness > 190:
                    # Fade edges
                    pixels[x, y] = (r, g, b, int(a * 0.2))

        img.save(output_path, "PNG")
        print(f"Saved transparent image to {output_path}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    input_file = r"C:\Users\User01\.gemini\antigravity\brain\42553532-c9fb-4974-b1fb-6ffba470f0bf\uploaded_image_1769122849432.png"
    output_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_final_v5.png"
    
    magic_wand_remove(input_file, output_file)
