from PIL import Image, ImageDraw
import sys

def flood_fill_remove_bg(input_path, output_path):
    print(f"Processing {input_path}...")
    try:
        img = Image.open(input_path).convert("RGBA")
        width, height = img.size
        
        # Create a mask for flood filling
        # ImageDraw.floodfill requires the image to be mutable
        # We'll use a tolerance-based flood fill on the alpha channel? 
        # Easier: Flood fill on a temporary mask specific to the background color.
        
        # Let's use a simpler approach: 
        # 1. Identify "background" pixels (white-ish)
        # 2. Use ImageDraw.floodfill logic to find connected components from (0,0)
        
        # Since PIL's native floodfill is simple, we might need to iterate or use a threshold.
        # But wait, ImageDraw.floodfill allows a 'thresh' (tolerance) since recent versions!
        
        # Let's try to flood fill the image starting at (0,0) replacing with transparent
        
        # Pick background color from top-left corner
        bg_pixel = img.getpixel((0, 0))
        print(f"Background color at (0,0): {bg_pixel}")
        
        # We want to replace it with (0,0,0,0)
        # Tolerance: The shadows are light gray, so we need a decent tolerance.
        # White is (255,255,255). Shadows might be (200,200,200). Diff is ~55 per channel.
        # Let's set tolerance to 60.
        
        ImageDraw.floodfill(img, xy=(0, 0), value=(0, 0, 0, 0), thresh=65)
        
        # Also do top-right, bottom-left, bottom-right just in case corners are isolated
        ImageDraw.floodfill(img, xy=(width-1, 0), value=(0, 0, 0, 0), thresh=65)
        ImageDraw.floodfill(img, xy=(0, height-1), value=(0, 0, 0, 0), thresh=65)
        ImageDraw.floodfill(img, xy=(width-1, height-1), value=(0, 0, 0, 0), thresh=65)

        img.save(output_path, "PNG")
        print(f"Saved transparent image to {output_path}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    input_file = r"C:\Users\User01\.gemini\antigravity\brain\42553532-c9fb-4974-b1fb-6ffba470f0bf\uploaded_image_1769124813821.png"
    output_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_final_v2.png"
    
    flood_fill_remove_bg(input_file, output_file)
