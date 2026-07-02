from PIL import Image, ImageChops

def correct_alpha_fade(input_path, output_path):
    print(f"Processing {input_path}...")
    try:
        img = Image.open(input_path).convert("RGBA")
        width, height = img.size
        
        # Get current alpha channel (which has the transparency from v2)
        r, g, b, current_alpha = img.split()
        
        # Create gradient mask (White = opaque/keep, Black = transparent/remove)
        gradient = Image.new('L', (width, height), 255)
        pixels = gradient.load()
        
        # Start fading at 88% of height
        fade_start = int(height * 0.88) 
        
        for y in range(fade_start, height):
            # Distance from start
            dist = y - fade_start
            max_dist = height - fade_start
            
            # Linear fade: 255 -> 0
            if max_dist > 0:
                alpha_val = int(255 * (1 - float(dist)/max_dist))
            else:
                alpha_val = 0
                
            # Apply to all x at this y
            for x in range(width):
                pixels[x, y] = alpha_val
                
        # KEY FIX: Combine alphas using MULTIPLY
        # New Alpha = Current Alpha * Gradient
        # This preserves the existing transparent background (where current alpha is 0)
        # and fades out the opaque parts at the bottom (where gradient < 255)
        new_alpha = ImageChops.multiply(current_alpha, gradient)
        
        # Apply the new combined alpha to the image
        img.putalpha(new_alpha)
        
        img.save(output_path, "PNG")
        print(f"Saved corrected image to {output_path}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Input: v2 (Good transparency, but has shadow artifacts)
    input_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_final_v2.png"
    # Output: v4 (Corrected fade)
    output_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_final_v4.png"
    
    correct_alpha_fade(input_file, output_file)
