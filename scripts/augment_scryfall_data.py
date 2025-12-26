import csv
import os
import glob

# --- Configuration ---
BASE_DATA_PATH = os.path.join("public", "assets", "data")
SCRYFALL_EXPORT_FILENAME_TEMPLATE = "scryfall_export_{set_code}.csv"
LANDS_FILENAME_TEMPLATE_PATTERN_1 = "17lands-{set_code}-card-ratings-*.csv"
LANDS_FILENAME_TEMPLATE_PATTERN_2 = "17Lands_export_{set_code}.csv" # Older pattern
AETHERHUB_FILENAME_TEMPLATE_PATTERN = "aetherhub-comments-{set_code}-*.txt"
OUTPUT_FILENAME_TEMPLATE = "tdm_data_{set_code}.csv"

# --- Helper Functions ---

def find_file(directory, pattern):
    """Finds a file matching the pattern in the given directory."""
    search_path = os.path.join(directory, pattern)
    files_found = glob.glob(search_path)
    if files_found:
        return files_found[0] # Return the first match
    return None

def load_csv_to_dict(filepath, key_column="Name"):
    """Loads a CSV into a list of dictionaries, or a dict keyed by key_column if specified."""
    data = []
    try:
        with open(filepath, 'r', newline='', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            if key_column:
                keyed_data = {}
                for row in reader:
                    # Normalize key for lookup (e.g. lowercase and strip)
                    # This is important if card names might have slight variations.
                    # However, for this script, we'll assume names are consistent initially.
                    key = row.get(key_column)
                    if key:
                         # Handle potential duplicate names by storing a list or deciding on a strategy
                         # For now, let's assume unique names or overwrite with the last entry.
                        keyed_data[key] = row
                return keyed_data
            else:
                for row in reader:
                    data.append(row)
                return data
    except FileNotFoundError:
        print(f"Info: CSV file not found: {filepath}")
    except Exception as e:
        print(f"Error loading CSV file {filepath}: {e}")
    return None if key_column else []


def load_aetherhub_data(filepath):
    """Loads AetherHub data (one card name per line) into a set."""
    card_names = set()
    if not filepath:
        return card_names
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                card_names.add(line.strip())
        print(f"Successfully loaded {len(card_names)} card names from {filepath}")
    except FileNotFoundError:
        print(f"Info: AetherHub file not found: {filepath}")
    except Exception as e:
        print(f"Error loading AetherHub file {filepath}: {e}")
    return card_names

# --- Main Logic ---

def main():
    set_code = input("Enter the three-letter MTG set code (e.g., MKM, WOE): ").strip().lower()
    if not set_code:
        print("No set code entered. Exiting.")
        return

    set_specific_data_path = os.path.join(BASE_DATA_PATH, set_code)

    if not os.path.isdir(set_specific_data_path):
        print(f"Error: Set-specific data directory not found: {set_specific_data_path}")
        print("Please ensure you have run 'fetch_cards_from_scryfall.py' for this set first,")
        print("or that the directory structure is correct.")
        return

    print(f"Operating in set directory: {set_specific_data_path}")

    # 1. Load Scryfall Data
    scryfall_file = os.path.join(set_specific_data_path, SCRYFALL_EXPORT_FILENAME_TEMPLATE.format(set_code=set_code))
    print(f"Looking for Scryfall data: {scryfall_file}")
    scryfall_cards = load_csv_to_dict(scryfall_file, key_column=None) # Load as list of dicts
    if not scryfall_cards:
        print(f"Could not load Scryfall data from {scryfall_file}. Exiting.")
        return
    print(f"Loaded {len(scryfall_cards)} cards from Scryfall export.")

    # 2. Load 17Lands Data
    lands_file_pattern_1 = LANDS_FILENAME_TEMPLATE_PATTERN_1.format(set_code=set_code.upper()) # Some patterns use uppercase
    lands_file_pattern_2 = LANDS_FILENAME_TEMPLATE_PATTERN_2.format(set_code=set_code)

    lands_filepath = find_file(set_specific_data_path, lands_file_pattern_1)
    if not lands_filepath:
        print(f"17Lands file not found with pattern {lands_file_pattern_1}. Trying alternative pattern...")
        lands_filepath = find_file(set_specific_data_path, lands_file_pattern_2)

    seventeen_lands_data = {}
    if lands_filepath:
        print(f"Loading 17Lands data from: {lands_filepath}")
        # Attempt to identify the correct card name column. Common names are "Name", "Card", "Card Name".
        # For simplicity, we'll try "Name" first. This might need to be more robust.
        temp_lands_data_list = load_csv_to_dict(lands_filepath, key_column=None)
        if temp_lands_data_list and isinstance(temp_lands_data_list, list) and temp_lands_data_list:
            # Determine the most likely name column
            header = temp_lands_data_list[0].keys()
            name_col = "Name" # Default
            if "Card Name" in header:
                name_col = "Card Name"
            elif "Card" in header: # Less specific, but a common fallback
                name_col = "Card"
            
            seventeen_lands_data = {row[name_col]: row for row in temp_lands_data_list if name_col in row}
            print(f"Loaded {len(seventeen_lands_data)} records from 17Lands, using '{name_col}' as card name column.")
        elif isinstance(temp_lands_data_list, dict): # if load_csv_to_dict somehow returned a dict
             seventeen_lands_data = temp_lands_data_list
             print(f"Loaded {len(seventeen_lands_data)} records from 17Lands (already keyed).")
        else:
            print(f"Could not effectively load or key 17Lands data from {lands_filepath}.")
    else:
        print(f"No 17Lands data file found for set {set_code} in {set_specific_data_path}.")


    # 3. Load AetherHub Data
    aetherhub_file_pattern = AETHERHUB_FILENAME_TEMPLATE_PATTERN.format(set_code=set_code.upper())
    aetherhub_filepath = find_file(set_specific_data_path, aetherhub_file_pattern)
    aetherhub_card_names = set()
    if aetherhub_filepath:
        print(f"Loading AetherHub data from: {aetherhub_filepath}")
        aetherhub_card_names = load_aetherhub_data(aetherhub_filepath)
    else:
        print(f"No AetherHub data file found for set {set_code} in {set_specific_data_path}.")


    # 4. Merge Data
    combined_data = []
    scryfall_cards_not_in_17lands = []
    scryfall_cards_not_in_aetherhub = []

    # Determine all possible fieldnames for the output CSV
    # Start with Scryfall fields, then add 17Lands fields (if any) and AetherHub flag
    all_fieldnames = list(scryfall_cards[0].keys()) if scryfall_cards else []
    
    if seventeen_lands_data:
        # Get fieldnames from the first record in 17Lands data, excluding the name column used for merging
        # This assumes all 17Lands records have the same structure
        sample_17lands_record = next(iter(seventeen_lands_data.values()), None)
        if sample_17lands_record:
            for key in sample_17lands_record.keys():
                if key not in all_fieldnames: # Add only new columns
                    all_fieldnames.append(key)
    
    if "In_AetherHub_List" not in all_fieldnames:
         all_fieldnames.append("In_AetherHub_List")


    for scryfall_card in scryfall_cards:
        card_name = scryfall_card.get("Name")
        if not card_name:
            continue # Should not happen if Scryfall data is clean

        merged_record = {**scryfall_card} # Start with Scryfall data

        # Augment with 17Lands data
        if seventeen_lands_data:
            lands_card_data = seventeen_lands_data.get(card_name)
            if lands_card_data:
                for key, value in lands_card_data.items():
                    if key != "Name": # Avoid duplicating the name column, or use a prefix
                        merged_record[f"17L_{key}"] = value # Prefix to avoid clashes and identify source
            else:
                scryfall_cards_not_in_17lands.append(card_name)
        
        # Augment with AetherHub presence
        if aetherhub_card_names:
            merged_record["In_AetherHub_List"] = card_name in aetherhub_card_names
            if not merged_record["In_AetherHub_List"]:
                scryfall_cards_not_in_aetherhub.append(card_name)
        else: # If no Aetherhub file was loaded
            merged_record["In_AetherHub_List"] = False # Default to false

        combined_data.append(merged_record)

    # Adjust all_fieldnames to include prefixed 17L columns if they were added
    if seventeen_lands_data and combined_data:
        potential_17l_prefixes = {f"17L_{key}" for key in next(iter(seventeen_lands_data.values()), {}).keys() if key != "Name"}
        # Remove non-prefixed 17L keys if they were added naively before
        all_fieldnames = [fn for fn in all_fieldnames if not (fn in potential_17l_prefixes and not fn.startswith("17L_"))]
        # Add all actual keys from the combined data to ensure all are captured
        current_keys = set()
        for record in combined_data:
            current_keys.update(record.keys())
        all_fieldnames = list(dict.fromkeys(all_fieldnames + sorted(list(current_keys)))) # Maintain order and add new ones


    # 5. Report Missing Cards
    if seventeen_lands_data: # Only report if we tried to load 17Lands data
        if scryfall_cards_not_in_17lands:
            print(f"\n--- {len(scryfall_cards_not_in_17lands)} Scryfall cards NOT found in 17Lands data for {set_code.upper()} ---")
            for name in scryfall_cards_not_in_17lands:
                print(name)
        else:
            print(f"\nAll Scryfall cards found in 17Lands data for {set_code.upper()} (or no 17Lands data loaded).")

    if aetherhub_card_names: # Only report if we tried to load AetherHub data
        if scryfall_cards_not_in_aetherhub:
            print(f"\n--- {len(scryfall_cards_not_in_aetherhub)} Scryfall cards NOT found in AetherHub list for {set_code.upper()} ---")
            # Only print those that were also not found in 17lands if 17lands was processed
            # This avoids printing names multiple times if they are missing from both.
            # However, the current lists are independent.
            for name in scryfall_cards_not_in_aetherhub:
                 print(name) # This might duplicate names if also missing from 17Lands
        else:
            print(f"\nAll Scryfall cards accounted for in AetherHub list for {set_code.upper()} (or no AetherHub data loaded).")

    # 6. Save Combined Data
    if not combined_data:
        print("\nNo combined data to save.")
        return

    output_filepath = os.path.join(set_specific_data_path, OUTPUT_FILENAME_TEMPLATE.format(set_code=set_code))
    print(f"\nSaving combined data for {len(combined_data)} cards to: {output_filepath}")
    try:
        with open(output_filepath, 'w', newline='', encoding='utf-8') as csvfile:
            # Ensure all_fieldnames are robustly generated from the actual data if there were issues
            if not all_fieldnames and combined_data: # Fallback if pre-generation failed
                 all_fieldnames = list(combined_data[0].keys())
                 for record in combined_data[1:]:
                     for key in record.keys():
                         if key not in all_fieldnames:
                             all_fieldnames.append(key)


            writer = csv.DictWriter(csvfile, fieldnames=all_fieldnames, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(combined_data)
        print("Successfully saved combined data.")
    except IOError as e:
        print(f"Error writing combined data to CSV: {e}")
    except Exception as e:
        print(f"An unexpected error occurred while writing combined data: {e}")

if __name__ == "__main__":
    main()
