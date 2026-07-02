from PIL import Image, ImageDraw

def remove_shadow_gradient(input_path, output_path):
    print(f"Processing {input_path}...")
    try:
        img = Image.open(input_path).convert("RGBA")
        width, height = img.size
        
        # New Alpha layer
        alpha = img.split()[3]
        
        # Create a gradient mask for the bottom 15% of the image
        # We want to keep the top 85% fully opaque, and fade out the bottom 15%
        # or just hard cut if it's detached.
        
        # Let's assess: The user complains about "something at the bottom". 
        # It's likely the floor reflection/shadow.
        # A soft gradient is safer than a hard cut.
        
        mask = Image.new('L', (width, height), 255)
        draw = ImageDraw.Draw(mask)
        
        shadow_start_y = int(height * 0.90) # Start fading at 90% down
        
        for y in range(shadow_start_y, height):
            # Linear fade from 255 to 0
            # relative_y goes from 0 to (height - shadow_start_y)
            relative_y = y - shadow_start_y
            total_fade_height = height - shadow_start_y
            
            # alpha value: 255 at top, 0 at bottom
            # Actually, let's be more aggressive. If it's the floor, maybe we just want to kill it.
            # But let's fade quickly.
            
            opacity = int(255 * (1 - (relative_y / total_fade_height)))
            
            # Draw this line into the mask
            # We need to combine this with existing alpha
            pass 

        # Better approach: Iterate pixels and modify alpha
        datas = img.getdata()
        newData = []
        
        for item in datas:
            # item is (r,g,b,a) sadly getdata flattens, we need coordinates.
            pass

        # Let's use putalpha with a generated mask
        # Create a gradient image
        gradient = Image.new('L', (1, height), 255)
        for y in range(height):
            if y > int(height * 0.88): # Bottom 12%
                # Simple linear fade
                dist = y - int(height * 0.88)
                max_dist = height - int(height * 0.88)
                val = int(255 * (1 - (dist / max_dist)**0.5)) # Convex fade
                gradient.putpixel((0, y), val)
            else:
                gradient.putpixel((0, y), 255)
                
        # Resize gradient to image width
        alpha_mask = gradient.resize((width, height))
        
        # Combine existing alpha with new mask
        # resultant_alpha = current_alpha * (mask_val / 255)
        
        # PIL compositing
        img.putalpha(alpha_mask) # This replaces alpha! We need to multiply.
        
        # Correct way to multiply alpha:
        # dest = src * mask
        
        # Actually simplest way:
        # Just use pixel access
        pixels = img.load()
        for y in range(height):
            for x in range(width):
                r, g, b, a = pixels[x, y]
                
                # Manual Eraser Logic for the "floor"
                # If we are at the bottom AND the pixel is somewhat dark/gray (shadow), kill it.
                if y > height * 0.85:
                    if a > 0:
                        # Fade it out blindly
                         mask_val = alpha_mask.getpixel((x, y))
                         new_a = int(a * (mask_val / 255.0))
                         pixels[x, y] = (r, g, b, new_a)
        
        img.save(output_path, "PNG")
        print(f"Saved transparent image to {output_path}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Input: The previous 'v2' which had everything removed except the feet shadow
    input_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_final_v2.png"
    output_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_final_v3.png"
    
    remove_shadow_gradient(input_file, output_file)
