/* INHYMA Admin — small UI helpers */

// Add a new empty row to a repeater group (single-input rows)
function addRepeaterRow(btn) {
  const wrap = btn.previousElementSibling; // .repeater
  const last = wrap.querySelector('.repeater__row');
  const clone = last.cloneNode(true);
  clone.querySelectorAll('input').forEach((i) => { i.value = ''; });
  wrap.appendChild(clone);
  clone.querySelector('input').focus();
}

// Add a paired spec row (name + value)
function addSpecRow(btn) {
  const wrap = document.getElementById('specRepeater');
  const row = document.createElement('div');
  row.className = 'repeater__row';
  row.innerHTML =
    '<input type="text" name="spec_name" placeholder="Spec name (e.g. Speed)">' +
    '<input type="text" name="spec_value" placeholder="Value (e.g. 60 PPM)">' +
    '<button type="button" class="repeater__remove" onclick="this.parentElement.remove()">×</button>';
  wrap.appendChild(row);
  row.querySelector('input').focus();
}

// Auto-suggest slug from a name/title field (only if slug is empty)
document.addEventListener('DOMContentLoaded', () => {
  const nameField = document.querySelector('[data-slug-source]');
  const slugField = document.querySelector('[data-slug-target]');
  if (nameField && slugField) {
    nameField.addEventListener('blur', () => {
      if (!slugField.value.trim()) {
        slugField.value = nameField.value.toLowerCase().trim()
          .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      }
    });
  }

  const categoryField = document.getElementById('productCategory');
  const subcategoryField = document.getElementById('productSubcategory');
  if (categoryField && subcategoryField) {
    const options = Array.from(subcategoryField.options).slice(1);
    const filterSubcategories = () => {
      const categoryId = categoryField.value;
      const selectedOption = subcategoryField.options[subcategoryField.selectedIndex];

      options.forEach((option) => {
        option.hidden = !categoryId || option.dataset.categoryId !== categoryId;
      });

      if (selectedOption && selectedOption.value && selectedOption.hidden) {
        subcategoryField.value = '';
      }
      subcategoryField.disabled = !categoryId;
    };

    categoryField.addEventListener('change', filterSubcategories);
    filterSubcategories();
  }

  const filterCategory = document.getElementById('productFilterCategory');
  const filterSubcategory = document.getElementById('productFilterSubcategory');
  if (filterCategory && filterSubcategory) {
    const options = Array.from(filterSubcategory.options).slice(1);
    const filterOptions = () => {
      const categorySlug = filterCategory.value;
      const selectedOption = filterSubcategory.options[filterSubcategory.selectedIndex];

      options.forEach((option) => {
        option.hidden = Boolean(categorySlug) && option.dataset.categorySlug !== categorySlug;
      });

      if (selectedOption && selectedOption.value && selectedOption.hidden) {
        filterSubcategory.value = '';
      }
    };

    filterCategory.addEventListener('change', filterOptions);
    filterSubcategory.addEventListener('change', () => {
      const selectedOption = filterSubcategory.options[filterSubcategory.selectedIndex];
      if (!filterCategory.value && selectedOption && selectedOption.value) {
        filterCategory.value = selectedOption.dataset.categorySlug;
        filterOptions();
      }
    });
    filterOptions();
  }
});
