import json
import os
import sys

def extract_sources(map_file, output_dir):
    with open(map_file, 'r') as f:
        data = json.load(f)
    
    sources = data.get('sources', [])
    contents = data.get('sourcesContent', [])
    
    if not contents:
        print("No sourcesContent found in the map file.")
        return

    for i, (source_path, content) in enumerate(zip(sources, contents)):
        if content is None:
            continue
            
        # Clean up the path
        # Remove webpack:// or other prefixes if present
        clean_path = source_path.replace('webpack://', '')
        
        # Remove leading dots and slashes to keep it inside output_dir
        while clean_path.startswith(('.', '/')):
            clean_path = clean_path.lstrip('./')
        
        # Ensure path is not empty
        if not clean_path:
            clean_path = f"source_{i}.js"
            
        target_path = os.path.abspath(os.path.join(output_dir, clean_path))
        
        # Security check: ensure it's still inside output_dir
        if not target_path.startswith(os.path.abspath(output_dir)):
            print(f"Skipping potentially unsafe path: {source_path}")
            continue
            
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        
        with open(target_path, 'w') as f:
            f.write(content)
        
        if i % 100 == 0:
            print(f"Extracted {i} files...")

    print(f"Extraction complete. Total files: {len(sources)}")

if __name__ == "__main__":
    extract_sources('cli.js.map', 'src_extracted')
