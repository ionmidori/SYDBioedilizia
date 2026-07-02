from PIL import Image
import math

def remove_background(input_path, output_path):
    print(f"Processing {input_path}...")
    try:
        img = Image.open(input_path).convert("RGBA")
        datas = img.getdata()

        newData = []
        
        # Target background color (White)
        bg_r, bg_g, bg_b = 255, 255, 255
        
        # Increased threshold to eat into shadows/artifacts
        threshold = 40  
        # Fade threshold to smooth edges
        fade_threshold = 80

        for item in datas:
            r, g, b, a = item
            
            # Calculate distance from white
            distance = math.sqrt((r - bg_r)**2 + (g - bg_g)**2 + (b - bg_b)**2)
            
            if distance < threshold:
                # Fully transparent if very close to white
                newData.append((255, 255, 255, 0))
            elif distance < fade_threshold:
                # Fade out pixels that are somewhat close to white (shadows/edges)
                # Map distance (threshold -> fade_threshold) to alpha (0 -> 255)
                alpha = int(((distance - threshold) / (fade_threshold - threshold)) * 255)
                newData.append((r, g, b, alpha))
            else:
                # Keep original pixel
                newData.append(item)

        img.putdata(newData)
        img.save(output_path, "PNG")
        print(f"Saved transparent image to {output_path}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    input_file = r"C:\Users\User01\.gemini\antigravity\brain\42553532-c9fb-4974-b1fb-6ffba470f0bf\uploaded_image_1769122849432.png"
    output_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_final.png"
    
    remove_background(input_file, output_file)
