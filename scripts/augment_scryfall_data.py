import csv
import os
import argparse
import re
from datetime import datetime

# Define the expected base path for data files relative to the script's location
# Script is in 'scripts/', data is in 'public/assets/data/'
DEFAULT_DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'data')

def find_latest_file(directory, prefix, suffix):
    """Finds the most recent file in a directory matching a prefix and suffix."""
    matching_files = []
    for filename in os.listdir(directory):
        if filename.startswith(prefix) and filename.endswith(suffix):
            # Extract date from filename, assuming format like prefix-YYYY-MM-DD.suffix or prefix-SET-YYYY-MM-DD.suffix
            # This regex tries to find a YYYY-MM-DD pattern
            match = re.search(r'(\d{4}-\d{2}-\d{2})', filename)
            if match:
                try:
                    file_date = datetime.strptime(match.group(1), '%Y-%m-%d').date()
                    matching_files.append((file_date, filename))
                except ValueError:
                    # If date parsing fails, maybe it's not a dated file in the way we expect
                    # or the date is not what we're looking for.
                    # For now, we'll add files without a clear date to a list to be picked if no dated files are found.
                    # A more robust solution might be needed if filenames vary greatly.
                    pass # Or add to a separate list of non-dated fallbacks.
            else:
                # If no date is found, but it matches prefix/suffix, consider it.
                # This is a fallback for files not following the date pattern.
                # We might just pick the first one found or based on other criteria.
                # For simplicity, we'll prefer dated files.
                # If only non-dated files match, this function would need adjustment or a simpler matching strategy.
                pass


    if not matching_files:
        # Fallback: if no dated files, look for a generic one (e.g., prefix.suffix or prefix-SET.suffix)
        # This part is simplified; a real implementation might need to be more specific
        # For example, if set_code is TDM, it might look for 17lands-TDM-card-ratings.csv
        generic_filename_parts = prefix.split('-')
        potential_generic_filename = f"{generic_filename_parts[0]}-{prefix.split('-')[-1]}-card-ratings{suffix}" #e.g. 17lands-TDM-card-ratings.csv
        if len(generic_filename_parts) > 1 and os.path.exists(os.path.join(directory, potential_generic_filename)):
             return os.path.join(directory, potential_generic_filename)
        potential_generic_filename_comments = f"{generic_filename_parts[0]}-comments-{prefix.split('-')[-1]}{suffix}" #e.g. aetherhub-comments-TDM.txt
        if len(generic_filename_parts) > 1 and os.path.exists(os.path.join(directory, potential_generic_filename_comments)):
            return os.path.join(directory, potential_generic_filename_comments)
        return None


    matching_files.sort(key=lambda x: x[0], reverse=True) # Sort by date, newest first
    return os.path.join(directory, matching_files[0][1])


def load_scryfall_data(set_code, data_path):
    """Loads card data from the Scryfall export CSV."""
    filename = os.path.join(data_path, f"scryfall_export_{set_code.lower()}.csv")
    if not os.path.exists(filename):
        print(f"Error: Scryfall export file not found: {filename}")
        return None
    
    cards = {}
    try:
        with open(filename, 'r', newline='', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                cards[row['Name']] = row
        print(f"Successfully loaded {len(cards)} cards from {filename}")
        return cards
    except Exception as e:
        print(f"Error reading Scryfall data from {filename}: {e}")
        return None

def load_17lands_data(set_code, data_path):
    """Loads card data from the 17Lands export CSV."""
    # Attempt to find the dated file first
    lands_prefix = f"17lands-{set_code.upper()}-card-ratings" # e.g., 17lands-TDM-card-ratings
    lands_suffix = ".csv"
    
    # We need to find a file that *contains* the set code, and might have a date.
    # Example: 17lands-TDM-card-ratings-2025-05-17.csv
    # Let's list files and find the best match.
    best_match_filename = None
    latest_date = None

    for f_name in os.listdir(data_path):
        if f_name.startswith(f"17lands-{set_code.upper()}-card-ratings") and f_name.endswith(".csv"):
            match = re.search(r'(\d{4}-\d{2}-\d{2})', f_name)
            if match:
                current_date = datetime.strptime(match.group(1), '%Y-%m-%d').date()
                if latest_date is None or current_date > latest_date:
                    latest_date = current_date
                    best_match_filename = f_name
            elif best_match_filename is None: # If no dated file found yet, take an undated one
                best_match_filename = f_name
    
    if not best_match_filename:
        print(f"Warning: 17Lands data file for set '{set_code.upper()}' not found in {data_path} with typical naming (e.g., 17lands-{set_code.upper()}-card-ratings-[date].csv).")
        return {} # Return empty dict if no file found

    filename = os.path.join(data_path, best_match_filename)
    print(f"Attempting to load 17Lands data from: {filename}")

    if not os.path.exists(filename):
        print(f"Warning: 17Lands data file not found: {filename}")
        return {}

    cards = {}
    try:
        with open(filename, 'r', newline='', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                # Remove quotes from card names if they exist
                card_name = row['Name'].strip('"')
                cards[card_name] = {f"17L_{k}": v for k, v in row.items() if k != 'Name'}
        print(f"Successfully loaded {len(cards)} cards from {filename}")
        return cards
    except Exception as e:
        print(f"Error reading 17Lands data from {filename}: {e}")
        return {}

def load_aetherhub_data(set_code, data_path):
    """Loads comments and ratings from the AetherHub export TXT file."""
    # Attempt to find the dated file first
    # Example: aetherhub-comments-TDM-2025-05-20.txt
    best_match_filename = None
    latest_date = None

    for f_name in os.listdir(data_path):
        if f_name.startswith(f"aetherhub-comments-{set_code.upper()}") and f_name.endswith(".txt"):
            match = re.search(r'(\d{4}-\d{2}-\d{2})', f_name)
            if match:
                current_date = datetime.strptime(match.group(1), '%Y-%m-%d').date()
                if latest_date is None or current_date > latest_date:
                    latest_date = current_date
                    best_match_filename = f_name
            elif best_match_filename is None: # If no dated file found yet, take an undated one
                best_match_filename = f_name
                
    if not best_match_filename:
        print(f"Warning: AetherHub data file for set '{set_code.upper()}' not found in {data_path} with typical naming (e.g., aetherhub-comments-{set_code.upper()}-[date].txt).")
        return {}

    filename = os.path.join(data_path, best_match_filename)
    print(f"Attempting to load AetherHub data from: {filename}")

    if not os.path.exists(filename):
        print(f"Warning: AetherHub data file not found: {filename}")
        return {}

    cards_comments = {}
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            current_card_name = None
            current_comment_lines = []
            ai_rating = None
            pro_rating = None

            for line in f:
                stripped_line = line.strip()
                if not stripped_line: # Empty line signifies end of an entry
                    if current_card_name:
                        cards_comments[current_card_name] = {
                            'AH_AI_Rating': ai_rating if ai_rating is not None else 'N/A',
                            'AH_Pro_Rating': pro_rating if pro_rating is not None else 'N/A',
                            'AH_Comment': " ".join(current_comment_lines).strip() or 'N/A'
                        }
                    current_card_name = None
                    current_comment_lines = []
                    ai_rating = None
                    pro_rating = None
                elif current_card_name is None: # Expecting a card name
                    current_card_name = stripped_line
                else: # Already have a card name, collecting data
                    ai_match = re.match(r"AI Rating:\s*(.*)", stripped_line, re.IGNORECASE)
                    pro_match = re.match(r"Pro Rating:\s*(.*)", stripped_line, re.IGNORECASE)
                    if ai_match:
                        ai_rating = ai_match.group(1).strip()
                    elif pro_match:
                        pro_rating = pro_match.group(1).strip()
                    else:
                        current_comment_lines.append(stripped_line)
            
            # Process the last card entry if file doesn't end with a blank line
            if current_card_name:
                cards_comments[current_card_name] = {
                    'AH_AI_Rating': ai_rating if ai_rating is not None else 'N/A',
                    'AH_Pro_Rating': pro_rating if pro_rating is not None else 'N/A',
                    'AH_Comment': " ".join(current_comment_lines).strip() or 'N/A'
                }
        print(f"Successfully loaded comments for {len(cards_comments)} cards from {filename}")
        return cards_comments
    except Exception as e:
        print(f"Error reading AetherHub data from {filename}: {e}")
        return {}

def main():
    parser = argparse.ArgumentParser(description="Augment Scryfall card data with 17Lands and AetherHub info.")
    parser.add_argument("set_code", help="The MTG set code (e.g., tdm, woe).")
    parser.add_argument("--data_path", default=DEFAULT_DATA_PATH, help=f"Path to the data files directory. Defaults to: {DEFAULT_DATA_PATH}")
    
    args = parser.parse_args()
    set_code = args.set_code.strip()
    data_path = args.data_path

    print(f"Processing set: {set_code.upper()}")
    print(f"Using data path: {data_path}")

    scryfall_cards = load_scryfall_data(set_code, data_path)
    if scryfall_cards is None:
        return

    lands_data = load_17lands_data(set_code, data_path)
    aetherhub_comments = load_aetherhub_data(set_code, data_path)

    augmented_data = []
    all_fieldnames = set() # To collect all unique fieldnames for the CSV

    # Start with Scryfall fields
    if scryfall_cards:
        sample_scryfall_card = next(iter(scryfall_cards.values()))
        all_fieldnames.update(sample_scryfall_card.keys())
    
    # Add 17Lands fields (prefixed)
    if lands_data:
        sample_lands_card = next(iter(lands_data.values()), None)
        if sample_lands_card:
            all_fieldnames.update(sample_lands_card.keys())

    # Add AetherHub fields (prefixed)
    all_fieldnames.update(['AH_AI_Rating', 'AH_Pro_Rating', 'AH_Comment'])


    print("\nAugmenting data...")
    cards_not_in_17lands = []
    cards_not_in_aetherhub = []

    for card_name, scryfall_info in scryfall_cards.items():
        combined_info = scryfall_info.copy()
        
        # Get 17Lands data
        card_lands_data = lands_data.get(card_name)
        if card_lands_data:
            combined_info.update(card_lands_data)
        else:
            cards_not_in_17lands.append(card_name)
            # Add empty placeholders for 17L fields if not found
            if lands_data : # Check if lands_data was loaded at all
                 sample_lands_fields = next(iter(lands_data.values()), {})
                 for field_key in sample_lands_fields.keys():
                     if field_key not in combined_info: combined_info[field_key] = 'N/A'


        # Get AetherHub data
        card_aetherhub_data = aetherhub_comments.get(card_name)
        if card_aetherhub_data:
            combined_info.update(card_aetherhub_data)
        else:
            cards_not_in_aetherhub.append(card_name)
            # Add empty placeholders for AH fields if not found
            combined_info['AH_AI_Rating'] = 'N/A'
            combined_info['AH_Pro_Rating'] = 'N/A'
            combined_info['AH_Comment'] = 'N/A'
            
        augmented_data.append(combined_info)

    # (5) Print cards not found in supplementary data
    if cards_not_in_17lands:
        print(f"\n--- {len(cards_not_in_17lands)} Cards Not Found in 17Lands Data ({set_code.upper()}) ---")
        for name in cards_not_in_17lands:
            print(name)
    
    if cards_not_in_aetherhub:
        print(f"\n--- {len(cards_not_in_aetherhub)} Cards Not Found in AetherHub Data ({set_code.upper()}) ---")
        for name in cards_not_in_aetherhub:
            print(name)

    # (6) Save the combined data
    # Output filename based on the request: tdm_data.csv.
    # It might be better to make this dynamic: f"{set_code.lower()}_augmented_data.csv"
    output_filename = os.path.join(data_path, f"{set_code.lower()}_data.csv") 
    # The user specifically asked for "tdm_data.csv". If the set_code is "tdm", this matches.
    # For other set codes, it will be "[set_code]_data.csv". If they truly want "tdm_data.csv"
    # regardless of set code, the line above should be:
    # output_filename = os.path.join(data_path, "tdm_data.csv")
    # I will use the specific name "tdm_data.csv" as requested.
    
    output_filename = os.path.join(data_path, "tdm_data.csv")


    if not augmented_data:
        print("\nNo data to write to CSV.")
        return

    # Ensure consistent field order
    # Start with Scryfall's original order, then add others alphabetically
    ordered_fieldnames = []
    if scryfall_cards:
        ordered_fieldnames.extend(next(iter(scryfall_cards.values())).keys())
    
    remaining_fieldnames = sorted(list(all_fieldnames - set(ordered_fieldnames)))
    ordered_fieldnames.extend(remaining_fieldnames)


    try:
        with open(output_filename, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=ordered_fieldnames, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(augmented_data)
        print(f"\nSuccessfully saved augmented data to: {output_filename}")
    except Exception as e:
        print(f"Error writing augmented data to {output_filename}: {e}")

if __name__ == "__main__":
    main()