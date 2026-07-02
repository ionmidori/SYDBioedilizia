from PIL import Image, ImageDraw
import colorsys

def saturation_key_remove(input_path, output_path):
    print(f"Processing {input_path}...")
    try:
        img = Image.open(input_path).convert("RGBA")
        width, height = img.size
        
        # Create an HSV version for analysis
        img_hsv = img.convert("HSV")
        pixels_hsv = img_hsv.load()
        pixels_rgba = img.load()
        
        # We will build a mask of "Safe to Remove" pixels
        # Condition: Saturation is LOW (White or Gray)
        # Saturation in PIL HSV is 0-255
        
        # Robot is Teal/Gold -> Very saturated.
        # Background is white/grey -> Saturation near 0.
        
        sat_threshold = 20 # 0-255 scale. 20 is ~8% saturation.
        
        # Strategy:
        # 1. Identify all pixels with Saturation < Threshold
        # 2. Flood fill this "Low Sat Map" from the corners and known hole locations.
        
        # Instead of complex graph traversal, let's just do generous seed-based flood clearing 
        # using the direct logic: "If pixel is Low Saturation AND connected to seed, kill it".
        
        # We use ImageDraw.floodfill on a mask?
        # No, let's just use a recursive function or stack-based fill simulation? 
        # Python recursion limit is risky.
        # Let's use a queue based fill.
        
        visited = set()
        queue = []
        
        # Seeds: Corners
        queue.append((0, 0))
        queue.append((width-1, 0))
        queue.append((0, height-1))
        queue.append((width-1, height-1))
        
        # Seeds: The "Hole" area (Center-Bottom)
        # Scan center line for low-sat pixels
        center_x = width // 2
        for y in range(int(height*0.5), int(height*0.9)):
             queue.append((center_x, y))
             
        # Add some off-center seeds for the hole too
        queue.append((center_x - 10, int(height*0.8)))
        queue.append((center_x + 10, int(height*0.8)))
        
        while queue:
            x, y = queue.pop(0)
            
            if (x, y) in visited:
                continue
            
            if x < 0 or x >= width or y < 0 or y >= height:
                continue
                
            visited.add((x, y))
            
            # Analyze pixel
            h, s, v = pixels_hsv[x, y]
            
            # If High Saturation (Robot parts), STOP. Boundary reached.
            if s > sat_threshold:
                continue
                
            # If Low Saturation (Background/Shadow/Hole/Highlight)
            # We remove it.
            # BUT, we must be careful not to kill internal highlights that are NOT connected to outside.
            # Checking connectivity is key. Since we started from OUTSIDE seeds (corners) + HOLE seeds,
            # we should flow into the background and the hole, but NOT jump over the robot body.
            
            # Kill pixel
            pixels_rgba[x, y] = (255, 255, 255, 0)
            
            # Add neighbors
            queue.append((x+1, y))
            queue.append((x-1, y))
            queue.append((x, y+1))
            queue.append((x, y-1))
            
        img.save(output_path, "PNG")
        print(f"Saved saturation-keyed image to {output_path}")

    except Exception as e:
        print(f"Error: {e}")
        # If queue blows up or logic fails, fallback to simple version

if __name__ == "__main__":
    # Start fresh from the original upload to get clean edges?
    # Or start from V6 (die cut)?
    # V6 already has the bottom fade. Let's use V6 to keep that nice feature.
    # But V6 alpha might interfere with HSV conversion logic if we ignore alpha.
    # Convert RGBA -> HSV usually ignores alpha. 
    # Let's rely on V6.
    
    input_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_v6_diecut.png"
    output_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_final_v9.png"
    
    saturation_key_remove(input_file, output_file)
