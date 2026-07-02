from PIL import Image, ImageDraw

def targeted_hole_punch(input_path, output_path):
    print(f"Processing {input_path}...")
    try:
        img = Image.open(input_path).convert("RGBA")
        width, height = img.size
        
        # We need to find the "hole" between the legs.
        # Based on standard robot proportions:
        # X range: Center (width/2)
        # Y range: Lower thigh/knee level to ankle level. (approx 75% to 85% height)
        
        center_x = int(width / 2)
        start_y = int(height * 0.70)
        end_y = int(height * 0.90)
        
        draw = ImageDraw.Draw(img)
        
        # Scan down the center line
        for y in range(start_y, end_y):
            pixel = img.getpixel((center_x, y))
            r, g, b, a = pixel
            
            # If we hit something that looks like background (White/Gray) AND is visible
            # Note: The background might be white (255,255,255) or shadowed gray (200,200,200)
            # The robot is Teal/Gold (darker).
            
            brightness = (r + g + b) // 3
            
            if a > 0 and brightness > 180:
                # We found the hole!
                print(f"Found hole candidate at ({center_x}, {y}) - Brightness: {brightness}")
                
                # Flood fill from this point with a generous tolerance (to catch shadows inside the hole)
                # 60 should be safe enough to not leak into the teal legs
                ImageDraw.floodfill(img, xy=(center_x, y), value=(0, 0, 0, 0), thresh=60)
                
                # Also try slightly offset points just in case the center line hits a wire or something
                ImageDraw.floodfill(img, xy=(center_x - 5, y), value=(0, 0, 0, 0), thresh=60)
                ImageDraw.floodfill(img, xy=(center_x + 5, y), value=(0, 0, 0, 0), thresh=60)
                
        img.save(output_path, "PNG")
        print(f"Saved targeted hole-punched image to {output_path}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Start from v6 (the die-cut version which was good except for the hole)
    input_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_v6_diecut.png"
    output_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_final_v8.png"
    
    targeted_hole_punch(input_file, output_file)
