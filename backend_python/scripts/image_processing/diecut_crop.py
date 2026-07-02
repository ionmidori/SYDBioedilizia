from PIL import Image, ImageDraw

def diecut_crop(input_path, output_path):
    print(f"Processing {input_path}...")
    try:
        img = Image.open(input_path).convert("RGBA")
        width, height = img.size
        
        # Create a mask that is fully opaque for the robot body
        # but fades out strictly at the very bottom where the feet/shadows are.
        
        # Let's say the feet are in the bottom 10%.
        # We will create a hard fade.
        
        mask = Image.new('L', (width, height), 255)
        draw = ImageDraw.Draw(mask)
        
        # Define the cut zone.
        # Everything below 92% height gets faded out.
        fade_start = int(height * 0.90)
        
        for y in range(fade_start, height):
            # Sharp fade
            dist = y - fade_start
            max_dist = height - fade_start
            
            # Quadratic fade for smoothness
            alpha_val = int(255 * (1 - (dist / max_dist)**2))
            
            # Draw line
            draw.line([(0, y), (width, y)], fill=alpha_val)
            
        r, g, b, a = img.split()
        
        # Multiply existing alpha with our die-cut mask
        from PIL import ImageChops
        new_alpha = ImageChops.multiply(a, mask)
        
        img.putalpha(new_alpha)
        img.save(output_path, "PNG")
        print(f"Saved die-cut image to {output_path}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Use v5 which was the best "manual" attempt so far (clean body)
    input_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_final_v5.png"
    output_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_v6_diecut.png"
    
    diecut_crop(input_file, output_file)
