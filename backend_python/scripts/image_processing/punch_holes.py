from PIL import Image

def punch_holes(input_path, output_path):
    print(f"Processing {input_path}...")
    try:
        img = Image.open(input_path).convert("RGBA")
        datas = img.getdata()

        newData = []
        
        # Threshold for "White"
        # We want to catch the background between legs, but save the robot's shiny highlights.
        # Highlights usually have color tint or are very small. Background is flat white/gray.
        # Let's use a high threshold.
        
        white_threshold = 240
        
        for item in datas:
            r, g, b, a = item
            
            # If it's already transparent, keep it
            if a == 0:
                newData.append(item)
                continue
            
            # Check if it's white/light gray
            if r > white_threshold and g > white_threshold and b > white_threshold:
                # It's white. Make it transparent.
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)

        img.putdata(newData)
        img.save(output_path, "PNG")
        print(f"Saved hole-punched image to {output_path}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Use v6 which has the nice "die cut" bottom but still has white holes
    input_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_v6_diecut.png"
    output_file = r"c:\Users\User01\.gemini\antigravity\scratch\renovation-next\web_client\public\assets\syd_final_v7.png"
    
    punch_holes(input_file, output_file)
